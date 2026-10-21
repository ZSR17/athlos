import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextRev } from '../src/db/index.ts';
import { exerciseOverrides, exercises } from '../src/db/schema.ts';
import { applyTranslations, loadTranslations } from '../src/import/translate.ts';
import { storeImage } from '../src/lib/media.ts';
import { TEST_PASSWORD, makeTestApp } from './helpers.ts';
import sharp from 'sharp';

let ctx: Awaited<ReturnType<typeof makeTestApp>>;
let headers: { authorization: string };
const T = 1_700_000_000_000;

const builtin = {
  id: 'squat',
  userId: null,
  source: 'builtin' as const,
  sourceRef: 'Barbell_Squat',
  name: 'Barbell Squat',
  sport: 'strength' as const,
  exerciseType: 'weight_reps' as const,
  category: 'strength',
  level: 'beginner',
  equipment: ['barbell'],
  primaryMuscles: ['quads' as const],
  secondaryMuscles: ['glutes' as const],
  instructions: ['Squat.'],
  mediaIds: [],
  createdAt: T,
  updatedAt: T,
};

// An exercise as a device pushes it.
const wire = (over: Record<string, unknown> = {}) => ({
  id: 'mine',
  source: 'custom',
  name: 'Squat bulgare',
  sport: 'strength',
  exerciseType: 'weight_reps',
  category: null,
  level: null,
  equipment: ['dumbbell'],
  primaryMuscles: ['quads', 'glutes'],
  secondaryMuscles: [],
  instructions: [],
  mediaIds: [],
  createdAt: T,
  updatedAt: T,
  deleted: false,
  ...over,
});

async function sync(since: number, changes: Record<string, unknown[]> = {}) {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/sync', headers, payload: { since, changes } });
  expect(res.statusCode).toBe(200);
  return res.json();
}
const pulled = async (id: string) => (await sync(0)).changes.exercises.find((e: { id: string }) => e.id === id);

beforeEach(async () => {
  ctx = await makeTestApp();
  ctx.db.insert(exercises).values({ ...builtin, rev: nextRev(ctx.db) }).run();
  const { token } = (
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password: TEST_PASSWORD, deviceName: 'A' } })
  ).json();
  headers = { authorization: `Bearer ${token}` };
});
afterEach(async () => {
  await ctx.cleanup();
});

describe('exercises', () => {
  it('creates and edits custom exercises through sync', async () => {
    expect((await sync(0, { exercises: [wire()] })).rejected).toEqual([]);
    expect(await pulled('mine')).toMatchObject({ name: 'Squat bulgare', source: 'custom', customized: false, mediaUrls: [] });
    await sync(0, { exercises: [wire({ name: 'Fente bulgare', updatedAt: T + 5 })] });
    // An older edit loses and the device gets the newer version back.
    const stale = await sync(0, { exercises: [wire({ name: 'Ancien', updatedAt: T + 1 })] });
    expect(stale.changes.exercises.find((e: { id: string }) => e.id === 'mine').name).toBe('Fente bulgare');
    expect(ctx.db.select().from(exercises).all().find((e) => e.id === 'mine')!.userId).toBe(ctx.ownerId);
  });

  it('keeps edits of a built-in exercise per user, and can go back to the original', async () => {
    const edit = wire({ ...builtin, source: 'builtin', name: 'Squat', secondaryMuscles: ['glutes', 'hamstrings'], updatedAt: T + 10 });
    expect((await sync(0, { exercises: [edit] })).rejected).toEqual([]);
    // The shared library row is untouched; the user sees their version.
    expect(ctx.db.select().from(exercises).all().find((e) => e.id === 'squat')!.name).toBe('Barbell Squat');
    expect(await pulled('squat')).toMatchObject({ name: 'Squat', secondaryMuscles: ['glutes', 'hamstrings'], customized: true, category: 'strength' });

    const { rev } = await sync(0);
    const reset = await ctx.app.inject({ method: 'DELETE', url: '/api/v1/exercises/squat/override', headers });
    expect(reset.statusCode).toBe(200);
    const after = await sync(rev);
    expect(after.changes.exercises).toHaveLength(1);
    expect(after.changes.exercises[0]).toMatchObject({ name: 'Barbell Squat', customized: false });
    // Newer than the customized version, so devices replace it.
    expect(after.changes.exercises[0].updatedAt).toBeGreaterThan(T + 10);
    expect((await ctx.app.inject({ method: 'DELETE', url: '/api/v1/exercises/squat/override', headers })).statusCode).toBe(404);
  });

  it('rejects unknown media, unknown built-ins and deleting a built-in', async () => {
    const res = await sync(0, {
      exercises: [
        wire({ mediaIds: ['a'.repeat(64)] }),
        wire({ id: 'ghost', source: 'builtin' }),
        wire({ ...builtin, source: 'builtin', deleted: true, updatedAt: T + 1 }),
      ],
    });
    expect(res.rejected).toEqual([
      { table: 'exercises', id: 'mine', reason: 'unknown_media' },
      { table: 'exercises', id: 'ghost', reason: 'unknown_exercise' },
      { table: 'exercises', id: 'squat', reason: 'builtin' },
    ]);
    expect(ctx.db.select().from(exerciseOverrides).all()).toEqual([]);
  });

  it('accepts uploaded media and returns their URLs', async () => {
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#f00' } }).png().toBuffer();
    const id = await storeImage(ctx.db, ctx.dataDir, png);
    await sync(0, { exercises: [wire({ mediaIds: [id] })] });
    expect((await pulled('mine')).mediaUrls).toEqual([`/media/${id}.webp`]);
  });

  it('translates built-in exercises once', () => {
    const table = {
      Barbell_Squat: { name: 'Squat à la barre', secondary: ['glutes' as const, 'hamstrings' as const], instructions: ['Descends.'] },
    };
    expect(applyTranslations(ctx.db, table)).toBe(1);
    expect(applyTranslations(ctx.db, table)).toBe(0);
    expect(ctx.db.select().from(exercises).get()).toMatchObject({
      name: 'Squat à la barre',
      secondaryMuscles: ['glutes', 'hamstrings'],
      instructions: ['Descends.'],
    });
    // The shipped table is valid (muscle and type ids) and covers the whole library.
    const shipped = loadTranslations();
    expect(Object.keys(shipped).length).toBeGreaterThanOrEqual(870);
    expect(Object.values(shipped).filter((t) => !t.instructions)).toEqual([]);
  });
});
