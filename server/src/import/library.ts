import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/index.ts';
import { exercises } from '../db/schema.ts';
import { type ImportOptions, importFreeExerciseDb } from './free-exercise-db.ts';
import { applyTranslations } from './translate.ts';

export function hasLibrary(db: Db): boolean {
  return (db.select({ n: sql<number>`count(*)` }).from(exercises).where(eq(exercises.source, 'builtin')).get()?.n ?? 0) > 0;
}

// A new server starts without the exercise library: import it (with the French names) so a fresh
// install works without a manual step. Does nothing once the library is there.
export async function ensureLibrary(db: Db, dataDir: string, opts: ImportOptions = {}): Promise<number> {
  if (hasLibrary(db)) return 0;
  const result = await importFreeExerciseDb(db, dataDir, opts);
  applyTranslations(db);
  return result.imported;
}
