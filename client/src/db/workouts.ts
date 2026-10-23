import type { SetTarget } from '@athlos/shared';
import { type ItemMode, defaultTargets, doneSets, doneValues, rankKey, toSimple, withDone } from '../lib/targets.ts';
import { type LocalExercise, type LocalWorkout, type LocalWorkoutItem, type AthlosDb, db as defaultDb } from './db.ts';
import { exerciseHistory } from './sessions.ts';

const now = () => Date.now();
const touched = () => ({ updatedAt: now(), dirty: 1 as const });

export async function liveItems(db: AthlosDb, workoutId: string): Promise<LocalWorkoutItem[]> {
  const items = await db.workoutItems.where('workoutId').equals(workoutId).toArray();
  return items.filter((i) => !i.deleted).sort((a, b) => a.position - b.position);
}

export async function createWorkout(name: string, db: AthlosDb = defaultDb): Promise<string> {
  const id = crypto.randomUUID();
  const last = (await db.workouts.orderBy('position').last())?.position ?? -1;
  const t = now();
  await db.workouts.add({
    id,
    sport: 'strength',
    name: name.trim() || 'Nouvelle séance',
    note: null,
    position: last + 1,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
    dirty: 1,
  });
  return id;
}

export async function updateWorkout(id: string, patch: Partial<Pick<LocalWorkout, 'name' | 'note'>>, db: AthlosDb = defaultDb) {
  await db.workouts.update(id, { ...patch, ...touched() });
}

export async function deleteWorkout(id: string, db: AthlosDb = defaultDb) {
  await db.transaction('rw', db.workouts, db.workoutItems, async () => {
    await db.workouts.update(id, { deleted: 1, ...touched() });
    await db.workoutItems.where('workoutId').equals(id).modify({ deleted: 1, ...touched() });
  });
}

export async function duplicateWorkout(id: string, db: AthlosDb = defaultDb): Promise<string> {
  const source = await db.workouts.get(id);
  if (!source) throw new Error('workout not found');
  const copyId = await createWorkout(`${source.name} (copie)`, db);
  const groups = new Map<string, string>();
  const items = await liveItems(db, id);
  const t = now();
  await db.workoutItems.bulkAdd(
    items.map((i) => ({
      ...i,
      id: crypto.randomUUID(),
      workoutId: copyId,
      supersetGroup: i.supersetGroup
        ? (groups.get(i.supersetGroup) ?? groups.set(i.supersetGroup, crypto.randomUUID()).get(i.supersetGroup)!)
        : null,
      createdAt: t,
      updatedAt: t,
      dirty: 1,
    })),
  );
  return copyId;
}

// A newly added exercise starts from what is known of it: the plan of another workout using it (sets,
// warm-ups, rests) with the values of the last time it was done; else the sets done last time; else
// the defaults of its type.
async function startingPlan(exercise: LocalExercise, db: AthlosDb): Promise<{ mode: ItemMode; targets: SetTarget[] }> {
  const others = (await db.workoutItems.where('exerciseId').equals(exercise.id).toArray())
    .filter((i) => !i.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  let base: LocalWorkoutItem | undefined;
  for (const item of others) {
    if ((await db.workouts.get(item.workoutId))?.deleted === 0) {
      base = item;
      break;
    }
  }
  const history = await exerciseHistory(exercise.id, db);
  const last = history[history.length - 1]?.sets ?? [];
  if (base) return withDone(base.targets, base.mode, doneSets(last.map((l, i) => ({ key: rankKey(last, i), set: l }))));
  if (last.length) {
    const restS = defaultTargets(exercise.exerciseType)[0]!.restS;
    const targets = last.map((l) => ({ kind: l.kind, ...doneValues(l), restS }));
    const identical = targets.every((t) => t.kind === 'normal' && JSON.stringify(t) === JSON.stringify(targets[0]));
    return { mode: identical ? 'simple' : 'per_set', targets };
  }
  return { mode: 'simple', targets: defaultTargets(exercise.exerciseType) };
}

export async function addItem(workoutId: string, exercise: LocalExercise, db: AthlosDb = defaultDb): Promise<string> {
  const items = await liveItems(db, workoutId);
  const { mode, targets } = await startingPlan(exercise, db);
  const id = crypto.randomUUID();
  const t = now();
  await db.workoutItems.add({
    id,
    workoutId,
    exerciseId: exercise.id,
    position: (items[items.length - 1]?.position ?? -1) + 1,
    mode,
    supersetGroup: null,
    targets,
    note: null,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
    dirty: 1,
  });
  await db.workouts.update(workoutId, touched());
  return id;
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<LocalWorkoutItem, 'targets' | 'note' | 'mode'>>,
  db: AthlosDb = defaultDb,
) {
  await db.workoutItems.update(id, { ...patch, ...touched() });
}

export async function setItemMode(item: LocalWorkoutItem, mode: ItemMode, db: AthlosDb = defaultDb) {
  if (item.mode === mode) return;
  const targets: SetTarget[] = mode === 'simple' ? toSimple(item.targets) : item.targets;
  await updateItem(item.id, { mode, targets }, db);
}

// Rewrites positions so the list order matches `orderedIds`, then cleans up broken supersets.
export async function reorderItems(workoutId: string, orderedIds: string[], db: AthlosDb = defaultDb) {
  await db.transaction('rw', db.workoutItems, async () => {
    for (const [position, id] of orderedIds.entries()) {
      await db.workoutItems.update(id, { position, ...touched() });
    }
    await normalizeSupersets(workoutId, db);
  });
}

export async function removeItem(item: LocalWorkoutItem, db: AthlosDb = defaultDb) {
  await db.transaction('rw', db.workoutItems, async () => {
    await db.workoutItems.update(item.id, { deleted: 1, ...touched() });
    await normalizeSupersets(item.workoutId, db);
  });
}

// Links `item` with the next exercise into a superset, or unlinks them if already linked.
export async function toggleSupersetWithNext(item: LocalWorkoutItem, db: AthlosDb = defaultDb) {
  await db.transaction('rw', db.workoutItems, async () => {
    const items = await liveItems(db, item.workoutId);
    const idx = items.findIndex((i) => i.id === item.id);
    const cur = items[idx];
    const next = items[idx + 1];
    if (!cur || !next) return;
    if (cur.supersetGroup && cur.supersetGroup === next.supersetGroup) {
      // Split the group after `cur`: everything from `next` on gets a fresh group.
      const fresh = crypto.randomUUID();
      for (const i of items.slice(idx + 1)) {
        if (i.supersetGroup !== cur.supersetGroup) break;
        await db.workoutItems.update(i.id, { supersetGroup: fresh, ...touched() });
      }
    } else {
      const group = cur.supersetGroup ?? next.supersetGroup ?? crypto.randomUUID();
      const nextGroup = next.supersetGroup;
      await db.workoutItems.update(cur.id, { supersetGroup: group, ...touched() });
      for (const i of items.slice(idx + 1)) {
        if (i.id !== next.id && (nextGroup === null || i.supersetGroup !== nextGroup)) break;
        await db.workoutItems.update(i.id, { supersetGroup: group, ...touched() });
      }
    }
    await normalizeSupersets(item.workoutId, db);
  });
}

// A superset must be a run of ≥ 2 consecutive items: drop groups that became singletons or got split.
async function normalizeSupersets(workoutId: string, db: AthlosDb = defaultDb) {
  const items = await liveItems(db, workoutId);
  const seen = new Set<string>();
  for (let start = 0; start < items.length; ) {
    const group = items[start]!.supersetGroup;
    let end = start;
    while (group && items[end + 1]?.supersetGroup === group) end++;
    if (group) {
      const run = items.slice(start, end + 1);
      // Singletons are ungrouped; a second run reusing a group id (after a reorder) gets its own id.
      const replacement = run.length < 2 ? null : seen.has(group) ? crypto.randomUUID() : group;
      if (replacement !== group) {
        for (const i of run) await db.workoutItems.update(i.id, { supersetGroup: replacement, ...touched() });
      }
      seen.add(group);
    }
    start = end + 1;
  }
}

// "A", "B"… per superset in order of appearance, for display.
export function supersetLabels(items: LocalWorkoutItem[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const i of items) {
    if (i.supersetGroup && !labels.has(i.supersetGroup)) {
      labels.set(i.supersetGroup, String.fromCharCode(65 + labels.size));
    }
  }
  return labels;
}
