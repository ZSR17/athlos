import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushSubscriptions } from '../src/db/schema.ts';
import type { PushTarget } from '../src/push.ts';
import { TEST_PASSWORD, makeTestApp } from './helpers.ts';

let ctx: Awaited<ReturnType<typeof makeTestApp>>;
let sent: { target: PushTarget; message: { title: string; body: string; tag: string } }[];
let status: number;

const subscription = (n = 1) => ({
  endpoint: `https://web.push.apple.com/device-${n}`,
  keys: { p256dh: 'BPub', auth: 'secret' },
});

async function login(deviceName: string) {
  const { token } = (
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password: TEST_PASSWORD, deviceName } })
  ).json();
  return { authorization: `Bearer ${token}` };
}
const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, headers: Record<string, string>, payload?: object) =>
  ctx.app.inject({ method, url: `/api/v1${url}`, headers, ...(payload ? { payload } : {}) });

beforeEach(async () => {
  sent = [];
  status = 201;
  ctx = await makeTestApp({}, {
    pushSender: async (target, payload) => {
      sent.push({ target, message: JSON.parse(payload) });
      return { status, detail: status === 410 ? 'Unregistered' : '' };
    },
  });
  // Only the reminder timers: the rest of the server keeps real timers.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(async () => {
  vi.useRealTimers();
  await ctx.cleanup();
});

describe('end-of-rest notifications', () => {
  it('gives a stable public key and remembers the subscription of a device', async () => {
    const phone = await login('iPhone');
    const key = (await call('GET', '/push/key', phone)).json().publicKey;
    expect(key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect((await call('GET', '/push/key', phone)).json().publicKey).toBe(key);

    expect((await call('GET', '/push/subscription', phone)).json()).toEqual({ subscribed: false });
    expect((await call('PUT', '/push/subscription', phone, { endpoint: 'not a url', keys: {} })).statusCode).toBe(400);
    await call('PUT', '/push/subscription', phone, subscription());
    await call('PUT', '/push/subscription', phone, subscription()); // same endpoint: one row
    expect(ctx.db.select().from(pushSubscriptions).all()).toHaveLength(1);
    expect((await call('GET', '/push/subscription', phone)).json()).toEqual({ subscribed: true });
  });

  it('sends the reminder when the rest is over, only to that device, and follows changes', async () => {
    const phone = await login('iPhone');
    const pc = await login('PC');
    await call('PUT', '/push/subscription', phone, subscription(1));
    await call('PUT', '/push/subscription', pc, subscription(2));

    expect((await call('PUT', '/push/rest', phone, { inMs: 90_000, body: 'Série 3 · Squat' })).json()).toEqual({ scheduled: true });
    await vi.advanceTimersByTimeAsync(89_000);
    expect(sent).toHaveLength(0);
    // +15 s: the new rest replaces the pending reminder.
    await call('PUT', '/push/rest', phone, { inMs: 16_000, body: 'Série 3 · Squat' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.target.endpoint).toBe(subscription(1).endpoint);
    expect(sent[0]!.message).toMatchObject({ title: 'Repos terminé', body: 'Série 3 · Squat', tag: 'athlos-rest' });

    // Skipping the rest cancels it.
    await call('PUT', '/push/rest', phone, { inMs: 5_000 });
    await call('DELETE', '/push/rest', phone);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toHaveLength(1);
    expect((await call('PUT', '/push/rest', phone, { inMs: 60 * 60 * 1000 })).statusCode).toBe(400);
  });

  it('forgets subscriptions the push service no longer knows, and those of logged out devices', async () => {
    const phone = await login('iPhone');
    await call('PUT', '/push/subscription', phone, subscription());
    status = 410;
    await call('PUT', '/push/rest', phone, { inMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ctx.db.select().from(pushSubscriptions).all()).toHaveLength(0);

    await call('PUT', '/push/subscription', phone, subscription());
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: phone });
    expect(ctx.db.select().from(pushSubscriptions).all()).toHaveLength(0);
  });
});
