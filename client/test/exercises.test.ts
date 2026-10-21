import { beforeEach, describe, expect, it } from 'vitest';
import { AthlosDb, type LocalExercise } from '../src/db/db.ts';
import { createExercise, deleteExercise, updateExercise } from '../src/db/exercises.ts';
import { createWorkout } from '../src/db/workouts.ts';
import { exportData, importData } from '../src/lib/backup.ts';

let db: AthlosDb;
let n = 0;
const builtin: LocalExercise = {
  id: 'squat',
  source: 'builtin',
  name: 'Squat',
  sport: 'strength',
  exerciseType: 'weight_reps',
  category: null,
  level: null,
  equipment: [],
  primaryMuscles: ['quads'],
  secondaryMuscles: [],
  instructions: [],
  mediaIds: [],
  mediaUrls: [],
  customized: false,
  createdAt: 0,
  updatedAt: 0,
  deleted: 0,
  dirty: 0,
};
const fields = {
  name: '  Fente bulgare ',
  exerciseType: 'weight_reps' as const,
  equipment: ['dumbbell'],
  primaryMuscles: ['quads' as const],
  secondaryMuscles: ['glutes' as const],
  instructions: [],
  mediaIds: [],
  mediaUrls: [],
};

beforeEach(async () => {
  db = new AthlosDb(`exercises-${n++}`);
  await db.exercises.add(builtin);
});

describe('exercises', () => {
  it('creates, edits and deletes custom exercises as rows to push', async () => {
    const id = await createExercise(fields, db);
    expect(await db.exercises.get(id)).toMatchObject({ name: 'Fente bulgare', source: 'custom', dirty: 1, deleted: 0 });
    await deleteExercise(id, db);
    expect(await db.exercises.get(id)).toMatchObject({ deleted: 1, dirty: 1 });
  });

  it('marks an edited built-in exercise as the user’s version', async () => {
    await updateExercise('squat', { ...fields, name: 'Mon squat' }, db);
    expect(await db.exercises.get('squat')).toMatchObject({ name: 'Mon squat', source: 'builtin', customized: true, dirty: 1 });
  });
});

describe('backup', () => {
  it('exports user data and merges it back without overwriting newer rows', async () => {
    const custom = await createExercise(fields, db);
    const w = await createWorkout('Jambes', db);
    const backup = JSON.parse(JSON.stringify(await exportData(db)));
    // The untouched library is not exported.
    expect(backup.tables.exercises.map((e: { id: string }) => e.id)).toEqual([custom]);
    expect(backup.tables.workouts[0]).not.toHaveProperty('dirty');

    const other = new AthlosDb(`exercises-${n++}`);
    expect(await importData(backup, other)).toEqual({ imported: 2, skipped: 0 });
    expect(await other.workouts.get(w)).toMatchObject({ name: 'Jambes', dirty: 1 });

    await other.workouts.update(w, { name: 'Plus récent', updatedAt: Date.now() + 1000 });
    expect((await importData(backup, other)).skipped).toBe(2);
    expect((await other.workouts.get(w))!.name).toBe('Plus récent');

    await expect(importData({ hello: 'world' }, other)).rejects.toThrow('export Athlos');
  });
});
