import { type HalkoDb, db as defaultDb } from '../db/db.ts';

// Safety-net export of everything the user created: workouts, history, custom exercises and
// their versions of built-in ones. Media files stay on the server (only their references are kept).
const TABLES = ['exercises', 'workouts', 'workoutItems', 'sessions', 'setLogs'] as const;
type Table = (typeof TABLES)[number];

interface Backup {
  app: 'halko';
  version: 1;
  exportedAt: number;
  tables: Record<Table, Record<string, unknown>[]>;
}

export async function exportData(db: HalkoDb = defaultDb): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const t of TABLES) {
    let rows: { dirty?: number; source?: string; customized?: boolean }[] = await db[t].toArray();
    if (t === 'exercises') rows = rows.filter((e) => e.source === 'custom' || e.customized);
    tables[t] = rows.map(({ dirty: _dirty, ...row }) => row);
  }
  return { app: 'halko', version: 1, exportedAt: Date.now(), tables };
}

export function downloadBackup(backup: Backup): void {
  const date = new Date(backup.exportedAt).toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `halko-${date}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class BackupError extends Error {}

// Merges an export into this device: rows missing or older here are taken, then synced as usual
// (the server keeps the most recent version of each row).
export async function importData(data: unknown, db: HalkoDb = defaultDb): Promise<{ imported: number; skipped: number }> {
  const backup = data as Partial<Backup> | null;
  // Exports made when the app was called Athlos are the same format.
  if (!['halko', 'athlos'].includes(backup?.app ?? '') || backup?.version !== 1 || typeof backup.tables !== 'object') {
    throw new BackupError('Ce fichier n’est pas un export Halko.');
  }
  let imported = 0;
  let skipped = 0;
  await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
    for (const t of TABLES) {
      const rows = backup.tables![t];
      if (!Array.isArray(rows)) continue;
      for (const row of rows as { id?: unknown; updatedAt?: unknown }[]) {
        if (typeof row?.id !== 'string' || typeof row.updatedAt !== 'number') {
          skipped++;
          continue;
        }
        const local = await db[t].get(row.id);
        if (local && local.updatedAt >= row.updatedAt) {
          skipped++;
          continue;
        }
        await (db[t] as unknown as { put: (r: unknown) => Promise<unknown> }).put({ ...row, dirty: 1 });
        imported++;
      }
    }
  });
  return { imported, skipped };
}
