import type { AthlosDb } from '../db/db.ts';
import { createStore } from '../lib/store.ts';

// Same cache the service worker reads media from (runtimeCaching in vite.config.ts).
const CACHE = 'media';

// Progress of the current download, for the settings and the library.
export const mediaStatus = createStore<{ running: boolean; done: number; total: number; failed: boolean }>({
  running: false,
  done: 0,
  total: 0,
  failed: false,
});

let running: Promise<number> | null = null;

// Downloads ahead of time the media of every exercise used in a workout (or of the whole library
// with `all`), so a session can be played offline even for exercises never opened on this device.
// Cached files are skipped.
export function precacheMedia(db: AthlosDb, { all = false }: { all?: boolean } = {}): Promise<number> {
  running ??= fill(db, all).finally(() => {
    running = null;
  });
  return running;
}

async function wantedUrls(db: AthlosDb, all: boolean): Promise<string[]> {
  let exercises;
  if (all) {
    exercises = await db.exercises.filter((e) => !e.deleted).toArray();
  } else {
    const items = await db.workoutItems.filter((i) => i.deleted === 0).toArray();
    exercises = await db.exercises.bulkGet([...new Set(items.map((i) => i.exerciseId))]);
  }
  return [...new Set(exercises.flatMap((e) => e?.mediaUrls ?? []))];
}

// Media of the whole library already on this device.
export async function mediaCoverage(db: AthlosDb): Promise<{ cached: number; total: number }> {
  if (!('caches' in globalThis)) return { cached: 0, total: 0 };
  const urls = await wantedUrls(db, true);
  const cache = await caches.open(CACHE);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  return { cached: urls.filter((u) => have.has(u)).length, total: urls.length };
}

async function fill(db: AthlosDb, all: boolean): Promise<number> {
  if (!('caches' in globalThis)) return 0;
  const cache = await caches.open(CACHE);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const missing = (await wantedUrls(db, all)).filter((u) => !have.has(u));
  if (!missing.length) return 0;
  mediaStatus.set({ running: true, done: 0, total: missing.length, failed: false });
  let added = 0;
  try {
    for (const url of missing) {
      try {
        await cache.add(url);
        added++;
      } catch {
        mediaStatus.set({ failed: true });
        break; // server unreachable: the next sync tries again
      }
      mediaStatus.set({ done: added });
    }
  } finally {
    mediaStatus.set({ running: false });
  }
  return added;
}
