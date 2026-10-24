import { beforeEach, describe, expect, it } from 'vitest';
import { type LocalExercise, HalkoDb } from '../src/db/db.ts';
import {
  addItem,
  createWorkout,
  deleteWorkout,
  duplicateWorkout,
  liveItems,
  removeItem,
  reorderItems,
  setItemMode,
  supersetLabels,
  toggleSupersetWithNext,
} from '../src/db/workouts.ts';

let db: HalkoDb;
let n = 0;

function exercise(name: string, exerciseType: LocalExercise['exerciseType'] = 'weight_reps'): LocalExercise {
  return {
    id: `ex-${name}`,
    source: 'builtin',
    name,
    sport: 'strength',
    exerciseType,
    category: 'strength',
    level: null,
    equipment: [],
    primaryMuscles: [],
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
}

async function workoutWith(names: string[]) {
  const id = await createWorkout('Jambes', db);
  for (const name of names) await addItem(id, exercise(name), db);
  return id;
}

const groups = async (id: string) => (await liveItems(db, id)).map((i) => i.supersetGroup);

beforeEach(() => {
  db = new HalkoDb(`test-${n++}`);
});

describe('workouts', () => {
  it('adds items with defaults for the exercise type and marks rows dirty', async () => {
    const id = await createWorkout('Jambes', db);
    await addItem(id, exercise('Planche', 'duration'), db);
    const [item] = await liveItems(db, id);
    expect(item).toMatchObject({ mode: 'simple', position: 0, dirty: 1, deleted: 0 });
    expect(item!.targets[0]).toMatchObject({ durationS: 30 });
  });

  it('links and unlinks supersets', async () => {
    const id = await workoutWith(['A', 'B', 'C']);
    let items = await liveItems(db, id);
    await toggleSupersetWithNext(items[0]!, db);
    const g = await groups(id);
    expect(g[0]).toBeTruthy();
    expect(g[0]).toBe(g[1]);
    expect(g[2]).toBeNull();

    // Extending the superset to a third exercise.
    items = await liveItems(db, id);
    await toggleSupersetWithNext(items[1]!, db);
    const g3 = await groups(id);
    expect(new Set(g3).size).toBe(1);
    expect(supersetLabels(await liveItems(db, id)).get(g3[0]!)).toBe('A');

    // Unlinking in the middle leaves a valid 2-item superset and an ungrouped item.
    items = await liveItems(db, id);
    await toggleSupersetWithNext(items[1]!, db);
    const g4 = await groups(id);
    expect(g4[0]).toBe(g4[1]);
    expect(g4[2]).toBeNull();
  });

  it('cleans up supersets broken by a reorder or a removal', async () => {
    const id = await workoutWith(['A', 'B', 'C']);
    let items = await liveItems(db, id);
    await toggleSupersetWithNext(items[0]!, db);
    items = await liveItems(db, id);
    // Move C between A and B: the superset is split into singletons, which get ungrouped.
    await reorderItems(id, [items[0]!.id, items[2]!.id, items[1]!.id], db);
    expect(await groups(id)).toEqual([null, null, null]);

    items = await liveItems(db, id);
    await toggleSupersetWithNext(items[0]!, db);
    items = await liveItems(db, id);
    await removeItem(items[1]!, db);
    expect(await groups(id)).toEqual([null, null]);
  });

  it('switches mode and duplicates / deletes workouts', async () => {
    const id = await workoutWith(['A', 'B']);
    const items = await liveItems(db, id);
    await toggleSupersetWithNext(items[0]!, db);
    await setItemMode(items[0]!, 'per_set', db);
    expect((await liveItems(db, id))[0]!.mode).toBe('per_set');

    const copy = await duplicateWorkout(id, db);
    const copied = await liveItems(db, copy);
    expect(copied).toHaveLength(2);
    expect(copied[0]!.supersetGroup).toBe(copied[1]!.supersetGroup);
    expect(copied[0]!.supersetGroup).not.toBe(items[0]!.supersetGroup ?? (await liveItems(db, id))[0]!.supersetGroup);

    await deleteWorkout(id, db);
    expect((await db.workouts.get(id))!.deleted).toBe(1);
    expect(await liveItems(db, id)).toEqual([]);
  });
});
