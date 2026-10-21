import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LocalExercise, AthlosDb } from '../src/db/db.ts';
import { getLive, sessionLogs, startSession } from '../src/db/sessions.ts';
import { addItem, createWorkout, liveItems, updateItem } from '../src/db/workouts.ts';
import { applyWatchActions, publishLive, watchSettings } from '../src/lib/watch.ts';

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
const plank: LocalExercise = { ...squat, id: 'plank', name: 'Gainage', exerciseType: 'duration' };

let db: AthlosDb;
let n = 0;
let published: { label: string; restS: number }[][];
let queued: { id: string; at: number }[];

beforeEach(async () => {
  db = new AthlosDb(`watch-${n++}`);
  await db.exercises.bulkAdd([squat, plank]);
  published = [];
  queued = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/live' && init?.method === 'PUT') published.push(JSON.parse(String(init.body)).steps);
      if (url === '/api/v1/live/actions/take') {
        const actions = queued;
        queued = [];
        return new Response(JSON.stringify({ actions }));
      }
      return new Response('{}');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  watchSettings.set({ enabled: false });
});

async function session() {
  const w = await createWorkout('Jambes', db);
  await addItem(w, squat, db);
  await addItem(w, plank, db);
  const [item, gainage] = await liveItems(db, w);
  await updateItem(
    item!.id,
    { targets: [{ kind: 'warmup', reps: 10, weightG: 40000, restS: 60 }, { kind: 'normal', reps: 8, weightG: 80000, restS: 120 }] },
    db,
  );
  await updateItem(gainage!.id, { targets: [{ kind: 'normal', durationS: 45, restS: 60 }] }, db);
  await startSession(w, db);
}

describe('validate the set from the watch', () => {
  it('publishes the sets to come, only when enabled', async () => {
    await session();
    await publishLive(db);
    expect(published).toHaveLength(0);

    watchSettings.set({ enabled: true });
    await publishLive(db);
    expect(published[0]).toEqual([
      { label: 'Échauffement · Squat', restS: 60 },
      { label: 'Série 1 · Squat', restS: 120 },
      { label: 'Série 1 · Gainage', restS: 0 },
    ]);
  });

  it('applies queued taps with the planned values, at the time of the tap', async () => {
    await session();
    watchSettings.set({ enabled: true });
    const at = Date.now() - 20_000;
    queued = [{ id: 'a', at }];
    await applyWatchActions(db);

    const logs = await sessionLogs((await getLive(db))!.sessionId, db);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ exerciseId: 'squat', kind: 'warmup', reps: 10, weightG: 40000, completedAt: at });
    const live = (await getLive(db))!;
    expect(live.cursor).toBe(1);
    expect(live.restEndsAt).toBe(at + 60_000);
    expect(published.at(-1)![0]!.label).toBe('Série 1 · Squat');

    // A tap whose rest is already over: the set is logged, no rest screen.
    queued = [{ id: 'b', at: Date.now() - 200_000 }];
    await applyWatchActions(db);
    expect((await getLive(db))!.restEndsAt).toBeNull();
    expect((await getLive(db))!.cursor).toBe(2);
  });
});
