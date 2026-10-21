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
import { addItem, createWorkout, liveItems, toggleSupersetWithNext, updateItem } from '../src/db/workouts.ts';
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
