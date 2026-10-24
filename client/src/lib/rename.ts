import Dexie from 'dexie';
import { HalkoDb } from '../db/db.ts';

// Halko used to be called Athlos. What a browser kept under the old name moves to the new one, once, so
// nobody is logged out or loses changes not synced yet. To remove once every device has loaded it.

const OLD = 'athlos';

// Login, sync, sound and colour settings. Runs when this module is loaded: main.tsx imports it first, before
// the modules that read these settings.
function moveSettings(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(`${OLD}.`)) continue;
      const renamed = `halko.${key.slice(OLD.length + 1)}`;
      if (localStorage.getItem(renamed) === null) localStorage.setItem(renamed, localStorage.getItem(key)!);
      localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing to move.
  }
}
moveSettings();

// The local copy of the data: copied into the new database while it is still empty, then deleted.
export async function moveLocalDatabase(db: HalkoDb, oldName = OLD): Promise<void> {
  try {
    if (!(await Dexie.exists(oldName))) return;
    const old = new HalkoDb(oldName);
    if ((await db.meta.count()) === 0 && (await db.exercises.count()) === 0) {
      // Read everything first: a transaction must not wait on another database.
      const rows = await Promise.all(old.tables.map(async (t) => [t.name, await t.toArray()] as const));
      await db.transaction('rw', db.tables, async () => {
        for (const [name, list] of rows) await db.table(name).bulkPut(list);
      });
    }
    old.close();
    await Dexie.delete(oldName);
  } catch {
    // Unreadable old copy: the new one is filled again by the sync.
  }
}
