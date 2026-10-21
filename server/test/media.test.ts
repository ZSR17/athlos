import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { nextRev } from '../src/db/index.ts';
import { exercises, media } from '../src/db/schema.ts';
import { mediaDir, mediaRelPath, storeImage } from '../src/lib/media.ts';
import { CLEANUP_GRACE_MS, cleanupMedia } from '../src/storage.ts';
import { TEST_PASSWORD, makeTestApp, tempDir } from './helpers.ts';

let ctx: Awaited<ReturnType<typeof makeTestApp>>;
afterEach(async () => {
  await ctx.cleanup();
});

async function start(env: Record<string, string> = {}) {
  ctx = await makeTestApp(env);
  const { token } = (
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password: TEST_PASSWORD, deviceName: 'A' } })
  ).json();
  return { authorization: `Bearer ${token}` };
}

const upload = (headers: Record<string, string>, body: Buffer, type: string) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/media', headers: { ...headers, 'content-type': type }, payload: body });

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('media', () => {
  it('compresses uploaded photos to small WebP files', async () => {
    const headers = await start();
    const jpg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3a86ff' } }).jpeg().toBuffer();
    const res = await upload(headers, jpg, 'image/jpeg');
    expect(res.statusCode).toBe(200);
    const { ids, urls } = res.json();
    expect(urls).toEqual([`/media/${ids[0]}.webp`]);
    const row = ctx.db.select().from(media).get()!;
    expect(row).toMatchObject({ mime: 'image/webp', width: 480, height: 320 });

    // Same picture again: stored once.
    expect((await upload(headers, jpg, 'image/jpeg')).json().ids).toEqual(ids);
    expect(ctx.db.select().from(media).all()).toHaveLength(1);
  });

  it('refuses files that are not photos or videos', async () => {
    const headers = await start();
    expect((await upload(headers, Buffer.from('hello'), 'text/plain')).statusCode).toBe(415);
    expect((await upload(headers, Buffer.from('not a picture'), 'image/png')).statusCode).toBe(415);
    const anonymous = await ctx.app.inject({ method: 'POST', url: '/api/v1/media', headers: { 'content-type': 'image/png' }, payload: Buffer.from('x') });
    expect(anonymous.statusCode).toBe(401);
  });

  it('says when video conversion is not installed', async () => {
    const headers = await start({ FFMPEG_PATH: path.join(tempDir(), 'missing-ffmpeg') });
    expect((await upload(headers, Buffer.from('fake video'), 'video/mp4')).statusCode).toBe(503);
  });

  it.skipIf(!hasFfmpeg)('converts a video to a short, light 480p MP4 with a poster', async () => {
    const headers = await start();
    const src = path.join(tempDir(), 'in.mp4');
    // 20 s of 1080p test pattern with sound.
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine',
      '-t', '20', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', '-shortest', src,
    ]);
    const res = await upload(headers, fs.readFileSync(src), 'video/mp4');
    expect(res.statusCode).toBe(200);
    const { ids, urls } = res.json();
    expect(urls).toEqual([`/media/${ids[0]}.mp4`, `/media/${ids[1]}.webp`]);
    const video = ctx.db.select().from(media).all().find((m) => m.id === ids[0])!;
    expect(video).toMatchObject({ mime: 'video/mp4', height: 480, width: 854 });
    expect(video.durationMs).toBeLessThanOrEqual(15_100);
    expect(video.bytes).toBeLessThan(fs.statSync(src).size / 4);
    const served = await ctx.app.inject({ method: 'GET', url: urls[0] });
    expect(served.headers['content-type']).toBe('video/mp4');
  });

  it('deletes media no exercise uses anymore, after a grace period', async () => {
    const headers = await start();
    const img = (color: string) => sharp({ create: { width: 10, height: 10, channels: 3, background: color } }).png().toBuffer();
    const used = await storeImage(ctx.db, ctx.dataDir, await img('#f00'));
    const unused = await storeImage(ctx.db, ctx.dataDir, await img('#0f0'));
    const T = Date.now();
    ctx.db
      .insert(exercises)
      .values({
        id: 'e', userId: null, source: 'builtin', sourceRef: 'e', name: 'e', sport: 'strength', exerciseType: 'bw_reps',
        category: null, level: null, equipment: [], primaryMuscles: [], secondaryMuscles: [], instructions: [],
        mediaIds: [used], createdAt: T, updatedAt: T, rev: nextRev(ctx.db),
      })
      .run();

    // Fresh uploads may not be attached yet.
    expect((await cleanupMedia(ctx.db, ctx.dataDir)).files).toBe(0);
    const later = T + CLEANUP_GRACE_MS + 1000;
    expect((await cleanupMedia(ctx.db, ctx.dataDir, later)).files).toBe(1);
    expect(ctx.db.select().from(media).all().map((m) => m.id)).toEqual([used]);
    expect(fs.existsSync(path.join(mediaDir(ctx.dataDir), mediaRelPath(unused, 'webp')))).toBe(false);
    expect(fs.existsSync(path.join(mediaDir(ctx.dataDir), mediaRelPath(used, 'webp')))).toBe(true);

    const storage = (await ctx.app.inject({ method: 'GET', url: '/api/v1/storage', headers })).json();
    expect(storage.media.files).toBe(1);
    expect(storage.databaseBytes).toBeGreaterThan(0);
  });
});
