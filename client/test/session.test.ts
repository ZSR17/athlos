import { beforeEach, describe, expect, it } from 'vitest';
import { type LocalExercise, AthlosDb } from '../src/db/db.ts';
import {
  addExtraSet,
  exerciseHistory,
  finishSession,
  getLive,
  logSet,
  previousPerformance,
  sessionLogs,
  startSession,
} from '../src/db/sessions.ts';
import { addItem, createWorkout, deleteWorkout, liveItems, toggleSupersetWithNext, updateItem } from '../src/db/workouts.ts';
import { metricsForType, recordFor } from '../src/lib/progress.ts';
import { type PlanItem, buildSteps, estimate1RM, nextOpenStep, prefill, restAfter } from '../src/lib/session.ts';

const plan = (items: Partial<PlanItem>[]): PlanItem[] =>
  items.map((p, k) => ({
    itemId: `i${k}`,
    exerciseId: `e${k}`,
    exerciseType: 'weight_reps',
    supersetGroup: null,
    targets: [{ kind: 'normal', reps: 8, restS: 90 }],
    note: null,
    ...p,
  }));

const sets = (n: number, restS = 90) => Array.from({ length: n }, () => ({ kind: 'normal' as const, reps: 8, restS }));

describe('steps', () => {
  it('runs plain exercises in order with their rest', () => {
    const p = plan([{ targets: sets(2, 120) }, { targets: sets(1) }]);
    const steps = buildSteps(p);
    expect(steps.map((s) => [s.item, s.set])).toEqual([[0, 0], [0, 1], [1, 0]]);
    expect(restAfter(p, steps, 0)).toBe(120);
    expect(restAfter(p, steps, 2)).toBe(0);
  });

  it('interleaves supersets and only rests after a full round', () => {
    const p = plan([
      { supersetGroup: 'A', targets: sets(3, 60) },
      { supersetGroup: 'A', targets: sets(2, 90) },
      { targets: sets(1) },
    ]);
    const steps = buildSteps(p);
    expect(steps.map((s) => [s.item, s.set])).toEqual([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [2, 0]]);
    expect(restAfter(p, steps, 0)).toBe(0); // A1 -> B1
    expect(restAfter(p, steps, 1)).toBe(90); // B1 -> A2
    expect(restAfter(p, steps, 3)).toBe(90); // B2 -> A3 (A finishes alone)
  });

  it('adds extra sets and finds the next open one', () => {
    const p = plan([{ targets: sets(2) }]);
    const steps = buildSteps(p, { i0: 1 });
    expect(steps).toHaveLength(3);
    expect(nextOpenStep(p, steps, new Set(['i0:0', 'i0:2']), 0)).toBe(1);
    expect(nextOpenStep(p, steps, new Set(['i0:0', 'i0:1', 'i0:2']), 0)).toBe(-1);
  });

  it('prefills with the previous performance, else the plan', () => {
    const target = { kind: 'normal' as const, reps: 8, weightG: 80000 };
    expect(prefill(target, undefined)).toMatchObject({ reps: 8, weightG: 80000 });
    expect(prefill(target, { reps: 7, weightG: 82500 })).toMatchObject({ reps: 7, weightG: 82500 });
  });

  it('estimates a 1RM', () => {
    expect(estimate1RM(100000, 1)).toBe(100000);
    expect(estimate1RM(80000, 8)).toBe(101333);
  });
});

describe('session flow', () => {
  let db: AthlosDb;
  let n = 0;
  const squat: LocalExercise = {
    id: 'squat',
    source: 'builtin',
    name: 'Squat',
    sport: 'strength',
    exerciseType: 'weight_reps',
    category: 'strength',
    level: null,
    equipment: [],
    primaryMuscles: ['quads'],
    secondaryMuscles: [],
    instructions: [],
    mediaIds: [],
    mediaUrls: [],
    customized: false,
    createdAt: 0,
    deleted: 0,
    dirty: 0,
    updatedAt: 0,
  };
  const plank: LocalExercise = { ...squat, id: 'plank', name: 'Plank', exerciseType: 'duration' };

  beforeEach(async () => {
    db = new AthlosDb(`session-${n++}`);
    await db.exercises.bulkAdd([squat, plank]);
  });

  async function doSession(workoutId: string, weights: number[]) {
    await startSession(workoutId, db);
    for (const w of weights) {
      const live = (await getLive(db))!;
      await logSet(live, live.cursor, { reps: 8, weightG: w }, db);
    }
    return finishSession(db);
  }

  it('logs sets, rests, finishes and remembers the previous performance', async () => {
    const w = await createWorkout('Jambes', db);
    await addItem(w, squat, db);
    const [item] = await liveItems(db, w);
    await updateItem(item!.id, { targets: sets(2, 120) }, db);

    const sessionId = await startSession(w, db);
    let live = (await getLive(db))!;
    expect(live.plan[0]!.targets).toHaveLength(2);
    await logSet(live, 0, { reps: 8, weightG: 80000 }, db);
    live = (await getLive(db))!;
    expect(live.cursor).toBe(1);
    expect(live.restTotalS).toBe(120);
    expect(live.restEndsAt).toBeGreaterThan(Date.now());

    await addExtraSet(live, 0, db);
    live = (await getLive(db))!;
    expect(live.cursor).toBe(2);

    await logSet(live, 1, { reps: 7, weightG: 82500 }, db);
    expect(await sessionLogs(sessionId, db)).toHaveLength(2);
    expect(await finishSession(db)).toBe(sessionId);
    expect(await getLive(db)).toBeNull();

    const prev = await previousPerformance('squat', 'another', db);
    expect(prev.get(1)).toMatchObject({ reps: 7, weightG: 82500 });
  });

  it('updates the workout plan with the values done', async () => {
    const w = await createWorkout('Jambes', db);
    await addItem(w, squat, db);
    await addItem(w, plank, db);
    const [simple, perSet] = await liveItems(db, w);
    await updateItem(simple!.id, { mode: 'simple', targets: sets(3).map((t) => ({ ...t, weightG: 80000 })) }, db);
    await updateItem(perSet!.id, { mode: 'per_set', targets: [30, 30].map((d) => ({ kind: 'normal' as const, durationS: d, restS: 60 })) }, db);

    await startSession(w, db);
    let live = (await getLive(db))!;
    await logSet(live, 0, { reps: 10, weightG: 82500 }, db);
    live = (await getLive(db))!;
    await logSet(live, 1, { reps: 9, weightG: 85000 }, db);
    live = (await getLive(db))!;
    await logSet(live, 3, { durationS: 45 }, db);
    await finishSession(db);

    const [a, b] = await liveItems(db, w);
    // Simple mode: the first set done is the model of all sets, rest unchanged.
    expect(a!.targets).toEqual(Array.from({ length: 3 }, () => ({ kind: 'normal', reps: 10, weightG: 82500, restS: 90 })));
    // Per set: only the sets done change.
    expect(b!.targets.map((t) => t.durationS)).toEqual([45, 30]);
    expect(b!.dirty).toBe(1);
  });

  it('updates every workout planning the same exercise', async () => {
    const legs = await createWorkout('Jambes', db);
    await addItem(legs, squat, db);
    const full = await createWorkout('Full body', db);
    await addItem(full, squat, db);
    const old = await createWorkout('Ancienne', db);
    await addItem(old, squat, db);
    await deleteWorkout(old, db);
    const [legsSquat] = await liveItems(db, legs);
    const [fullSquat] = await liveItems(db, full);
    await updateItem(legsSquat!.id, { mode: 'per_set', targets: sets(2) }, db);
    // Same exercise with a warm-up first: matched by working set, the warm-up is left alone.
    const warmup = { kind: 'warmup' as const, reps: 12, weightG: 40000, restS: 60 };
    await updateItem(fullSquat!.id, { mode: 'per_set', targets: [warmup, ...sets(3)] }, db);

    await startSession(legs, db);
    let live = (await getLive(db))!;
    await logSet(live, 0, { reps: 6, weightG: 100000 }, db);
    live = (await getLive(db))!;
    await logSet(live, 1, { reps: 5, weightG: 102500 }, db);
    await finishSession(db);

    expect((await liveItems(db, full))[0]!.targets.map((t) => [t.kind, t.reps, t.weightG])).toEqual([
      ['warmup', 12, 40000],
      ['normal', 6, 100000],
      ['normal', 5, 102500],
      ['normal', 8, undefined],
    ]);
    const [oldSquat] = await db.workoutItems.where('workoutId').equals(old).toArray();
    expect(oldSquat!.targets[0]!.weightG).not.toBe(100000);
  });

  it('discards a session without any set', async () => {
    const w = await createWorkout('Vide', db);
    await addItem(w, squat, db);
    const id = await startSession(w, db);
    expect(await finishSession(db)).toBeNull();
    expect((await db.sessions.get(id))!.deleted).toBe(1);
  });

  it('runs a superset without rest inside a round', async () => {
    const w = await createWorkout('SS', db);
    await addItem(w, squat, db);
    await addItem(w, plank, db);
    await toggleSupersetWithNext((await liveItems(db, w))[0]!, db);
    await startSession(w, db);
    const live = (await getLive(db))!;
    await logSet(live, 0, { reps: 8, weightG: 60000 }, db);
    const after = (await getLive(db))!;
    expect(after.cursor).toBe(1);
    expect(after.restEndsAt).toBeNull();
  });

  it('detects records against earlier sessions', async () => {
    const w = await createWorkout('Jambes', db);
    await addItem(w, squat, db);
    await doSession(w, [60000, 70000, 70000]);
    await doSession(w, [60000, 75000, 70000]);
    const history = await exerciseHistory('squat', db);
    expect(history).toHaveLength(2);
    const [maxWeight] = metricsForType('weight_reps');
    expect(recordFor(maxWeight!, [history[0]!.sets], history[1]!.sets)).toEqual({ value: 75000, previous: 70000 });
    expect(recordFor(maxWeight!, [], history[0]!.sets)).toBeNull();
  });
});
