import { type PlanItem, type SetValues, type Step, buildSteps, nextOpenStep, restAfter, stepKey } from '../lib/session.ts';
import { updateAll } from '../lib/targets.ts';
import { type LocalSession, type LocalSetLog, type AthlosDb, db as defaultDb } from './db.ts';
import { liveItems } from './workouts.ts';

// State of the session being performed. Device-local (never synced): only the session row and its
// set logs are shared. Timers are stored as timestamps so they survive the app being suspended.
export interface LiveState {
  sessionId: string;
  workoutId: string | null;
  plan: PlanItem[];
  extra: Record<string, number>;
  cursor: number;
  restEndsAt: number | null;
  restTotalS: number;
}

const LIVE = 'live';
const touched = () => ({ updatedAt: Date.now(), dirty: 1 as const });

export async function getLive(db: AthlosDb = defaultDb): Promise<LiveState | null> {
  return ((await db.meta.get(LIVE))?.value as LiveState | undefined) ?? null;
}

async function saveLive(db: AthlosDb, live: LiveState) {
  await db.meta.put({ key: LIVE, value: live });
}

export async function updateLive(patch: Partial<LiveState>, db: AthlosDb = defaultDb) {
  const live = await getLive(db);
  if (live) await saveLive(db, { ...live, ...patch });
}

export async function startSession(workoutId: string, db: AthlosDb = defaultDb): Promise<string> {
  const existing = await getLive(db);
  if (existing) return existing.sessionId;
  const workout = await db.workouts.get(workoutId);
  if (!workout) throw new Error('workout not found');
  const items = await liveItems(db, workoutId);
  const exercises = await db.exercises.bulkGet(items.map((i) => i.exerciseId));
  const plan: PlanItem[] = items.map((i, k) => ({
    itemId: i.id,
    exerciseId: i.exerciseId,
    exerciseType: exercises[k]?.exerciseType ?? 'weight_reps',
    supersetGroup: i.supersetGroup,
    targets: i.targets,
    note: i.note,
  }));
  const sessionId = crypto.randomUUID();
  const t = Date.now();
  await db.transaction('rw', db.sessions, db.meta, async () => {
    await db.sessions.add({
      id: sessionId,
      workoutId,
      sport: workout.sport,
      name: workout.name,
      startedAt: t,
      endedAt: null,
      note: null,
      createdAt: t,
      updatedAt: t,
      deleted: 0,
      dirty: 1,
    });
    await saveLive(db, { sessionId, workoutId, plan, extra: {}, cursor: 0, restEndsAt: null, restTotalS: 0 });
  });
  return sessionId;
}

export async function sessionLogs(sessionId: string, db: AthlosDb = defaultDb): Promise<LocalSetLog[]> {
  const logs = await db.setLogs.where('sessionId').equals(sessionId).toArray();
  return logs.filter((l) => !l.deleted).sort((a, b) => a.completedAt - b.completedAt);
}

export function doneKeys(logs: LocalSetLog[]): Set<string> {
  return new Set(logs.map((l) => `${l.workoutItemId}:${l.setIndex}`));
}

// Records a performed set, then moves to the next open set and starts the rest timer.
export async function logSet(live: LiveState, stepIndex: number, values: SetValues, db: AthlosDb = defaultDb) {
  const steps = buildSteps(live.plan, live.extra);
  const step = steps[stepIndex];
  if (!step) return;
  const item = live.plan[step.item]!;
  const t = Date.now();
  await db.transaction('rw', db.setLogs, db.meta, async () => {
    const already = (await sessionLogs(live.sessionId, db)).find(
      (l) => l.workoutItemId === item.itemId && l.setIndex === step.set,
    );
    const row: LocalSetLog = {
      id: already?.id ?? crypto.randomUUID(),
      sessionId: live.sessionId,
      exerciseId: item.exerciseId,
      workoutItemId: item.itemId,
      position: step.item,
      setIndex: step.set,
      kind: step.target.kind,
      ...values,
      completedAt: t,
      createdAt: already?.createdAt ?? t,
      updatedAt: t,
      deleted: 0,
      dirty: 1,
    };
    await db.setLogs.put(row);
    const done = doneKeys(await sessionLogs(live.sessionId, db));
    const rest = restAfter(live.plan, steps, stepIndex);
    const next = nextOpenStep(live.plan, steps, done, stepIndex);
    await saveLive(db, {
      ...live,
      cursor: next === -1 ? stepIndex : next,
      restEndsAt: rest > 0 && next !== -1 ? t + rest * 1000 : null,
      restTotalS: rest,
    });
  });
}


export async function addExtraSet(live: LiveState, item: number, db: AthlosDb = defaultDb) {
  const itemId = live.plan[item]!.itemId;
  const extra = { ...live.extra, [itemId]: (live.extra[itemId] ?? 0) + 1 };
  const steps = buildSteps(live.plan, extra);
  const newSet = live.plan[item]!.targets.length + extra[itemId]! - 1;
  const cursor = steps.findIndex((s) => s.item === item && s.set === newSet);
  await saveLive(db, { ...live, extra, cursor });
}

// Jump to the first open set of an exercise (or its first set if all are done).
export function cursorForItem(live: LiveState, steps: Step[], done: Set<string>, item: number): number {
  const open = steps.findIndex((s) => s.item === item && !done.has(stepKey(live.plan, s)));
  return open !== -1 ? open : steps.findIndex((s) => s.item === item);
}

export async function finishSession(db: AthlosDb = defaultDb): Promise<string | null> {
  const live = await getLive(db);
  if (!live) return null;
  const logs = await sessionLogs(live.sessionId, db);
  if (logs.length === 0) {
    await discardSession(db);
    return null;
  }
  await db.transaction('rw', db.sessions, db.workoutItems, db.meta, async () => {
    await db.sessions.update(live.sessionId, { endedAt: Date.now(), ...touched() });
    await updatePlan(db, logs);
    await db.meta.delete(LIVE);
  });
  return live.sessionId;
}

const valuesDone = (l: LocalSetLog): SetValues =>
  Object.fromEntries((['reps', 'weightG', 'durationS', 'distanceM'] as const).filter((k) => l[k] != null).map((k) => [k, l[k]]));

// The workout's plan takes the values just done, so editing it shows them. Only planned sets change
// (extra sets are not added); in simple mode (identical sets) the first working set done is the model.
async function updatePlan(db: AthlosDb, logs: LocalSetLog[]) {
  for (const itemId of new Set(logs.map((l) => l.workoutItemId))) {
    const item = itemId ? await db.workoutItems.get(itemId) : undefined;
    if (!item || item.deleted) continue;
    const itemLogs = logs.filter((l) => l.workoutItemId === itemId && l.setIndex < item.targets.length).sort((a, b) => a.setIndex - b.setIndex);
    let targets = item.targets;
    if (item.mode === 'simple') {
      const model = itemLogs.find((l) => l.kind !== 'warmup');
      if (model) targets = updateAll(targets, valuesDone(model));
    } else {
      targets = targets.map((t, i) => {
        const log = itemLogs.find((l) => l.setIndex === i);
        return log ? { ...t, ...valuesDone(log) } : t;
      });
    }
    if (JSON.stringify(targets) !== JSON.stringify(item.targets)) await db.workoutItems.update(item.id, { targets, ...touched() });
  }
}

export async function discardSession(db: AthlosDb = defaultDb) {
  const live = await getLive(db);
  if (!live) return;
  await deleteSession(live.sessionId, db);
}

export async function deleteSession(sessionId: string, db: AthlosDb = defaultDb) {
  await db.transaction('rw', db.sessions, db.setLogs, db.meta, async () => {
    await db.sessions.update(sessionId, { deleted: 1, ...touched() });
    await db.setLogs.where('sessionId').equals(sessionId).modify({ deleted: 1, ...touched() });
    const live = await getLive(db);
    if (live?.sessionId === sessionId) await db.meta.delete(LIVE);
  });
}

export async function finishedSessions(db: AthlosDb = defaultDb): Promise<LocalSession[]> {
  const rows = await db.sessions.orderBy('startedAt').reverse().toArray();
  return rows.filter((s) => !s.deleted && s.endedAt !== null);
}

// All logs of an exercise in finished sessions, grouped by session, oldest first.
export async function exerciseHistory(exerciseId: string, db: AthlosDb = defaultDb) {
  const logs = (await db.setLogs.where('[exerciseId+completedAt]').between([exerciseId, 0], [exerciseId, Infinity]).toArray()).filter(
    (l) => !l.deleted,
  );
  const sessions = new Map((await finishedSessions(db)).map((s) => [s.id, s]));
  const bySession = new Map<string, LocalSetLog[]>();
  for (const l of logs) {
    if (!sessions.has(l.sessionId)) continue;
    bySession.set(l.sessionId, [...(bySession.get(l.sessionId) ?? []), l]);
  }
  return [...bySession.entries()]
    .map(([id, sets]) => ({ session: sessions.get(id)!, sets: sets.sort((a, b) => a.setIndex - b.setIndex) }))
    .sort((a, b) => a.session.startedAt - b.session.startedAt);
}

// What was done for each set index the last time this exercise was performed (outside this session).
export async function previousPerformance(
  exerciseId: string,
  excludeSessionId: string,
  db: AthlosDb = defaultDb,
): Promise<Map<number, SetValues>> {
  const history = (await exerciseHistory(exerciseId, db)).filter((h) => h.session.id !== excludeSessionId);
  const last = history[history.length - 1];
  return new Map((last?.sets ?? []).map((s) => [s.setIndex, s]));
}
