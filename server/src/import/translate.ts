import fs from 'node:fs';
import { EXERCISE_TYPE_IDS, type ExerciseType, MUSCLE_IDS, type MuscleId } from '@halko/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type Db, nextRev } from '../db/index.ts';
import { exercises } from '../db/schema.ts';

const muscles = z.array(z.enum(MUSCLE_IDS as [MuscleId, ...MuscleId[]]));
// French names and instructions of the built-in exercises, keyed by their free-exercise-db id, with
// fixes to the community muscle data (and a few exercise types) where it was wrong or incomplete.
const translationsSchema = z.record(
  z.string(),
  z.object({
    name: z.string().min(1),
    type: z.enum(EXERCISE_TYPE_IDS as [ExerciseType, ...ExerciseType[]]).optional(),
    primary: muscles.optional(),
    secondary: muscles.optional(),
    instructions: z.array(z.string().min(1)).optional(),
  }),
);
type Translations = z.infer<typeof translationsSchema>;

export function loadTranslations(): Translations {
  const file = new URL('./translations-fr.json', import.meta.url);
  return translationsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Brings built-in exercises in line with the table; rows already up to date are left alone, so
// it runs at every start and only new or changed entries reach the devices.
export function applyTranslations(db: Db, translations: Translations = loadTranslations()): number {
  let changed = 0;
  db.transaction((tx) => {
    for (const [ref, t] of Object.entries(translations)) {
      const row = tx
        .select()
        .from(exercises)
        .where(and(eq(exercises.source, 'builtin'), eq(exercises.sourceRef, ref)))
        .get();
      if (!row) continue;
      const next = {
        name: t.name,
        exerciseType: t.type ?? row.exerciseType,
        primaryMuscles: t.primary ?? row.primaryMuscles,
        secondaryMuscles: t.secondary ?? row.secondaryMuscles,
        instructions: t.instructions ?? row.instructions,
      };
      if (Object.entries(next).every(([k, v]) => same(v, row[k as keyof typeof row]))) continue;
      tx.update(exercises)
        .set({ ...next, updatedAt: Date.now(), rev: nextRev(tx) })
        .where(eq(exercises.id, row.id))
        .run();
      changed++;
    }
  });
  return changed;
}
