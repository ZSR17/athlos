// Usage: npm run import:exercises [-- --source <free-exercise-db checkout>] [--force]
// Imports the built-in exercise library and converts its images to small WebP files.
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.ts';
import { openDb } from '../db/index.ts';
import { importFreeExerciseDb } from '../import/free-exercise-db.ts';
import { applyTranslations } from '../import/translate.ts';

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});

const config = loadConfig();
const db = openDb(config.dataDir);
const started = Date.now();
const result = await importFreeExerciseDb(db, config.dataDir, {
  sourceDir: values.source,
  force: values.force,
  log: (msg) => console.log(msg),
});
const translated = applyTranslations(db);
db.$client.close();

console.log(
  `Terminé en ${Math.round((Date.now() - started) / 1000)} s : ${result.imported} importés, ` +
    `${result.skipped} déjà présents, ${result.failed.length} en échec, ${translated} traduits.`,
);
for (const f of result.failed) console.error(`  échec ${f}`);
process.exit(result.failed.length ? 1 : 0);
