import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_PASSWORD, makeTestApp } from './helpers.ts';

let ctx: Awaited<ReturnType<typeof makeTestApp>>;
let sent: { body: string }[];

async function login(deviceName: string) {
  const { token } = (
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { password: TEST_PASSWORD, deviceName } })
  ).json();
  return { authorization: `Bearer ${token}` };
}
const call = (method: 'POST' | 'PUT' | 'DELETE', url: string, headers: Record<string, string>, payload?: object) =>
  ctx.app.inject({ method, url: `/api/v1${url}`, headers, ...(payload ? { payload } : {}) });

const steps = [
  { label: 'Série 1 · Squat', restS: 90 },
  { label: 'Série 2 · Squat', restS: 0 },
  { label: 'Série 1 · Gainage', restS: 60 },
];

beforeEach(async () => {
  sent = [];
  ctx = await makeTestApp({}, {
    pushSender: async (_target, payload) => {
      sent.push(JSON.parse(payload));
      return { status: 201, detail: '' };
    },
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(async () => {
  vi.useRealTimers();
  await ctx.cleanup();
});

describe('validate the set from the watch', () => {
  it('answers the watch, starts the rest reminder on the phone and queues the action for the app', async () => {
    const phone = await login('iPhone');
    await call('PUT', '/push/subscription', phone, { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'k', auth: 'a' } });
    const { token } = (await call('POST', '/devices/shortcut', phone)).json();
    const watch = { authorization: `Bearer ${token}` };

    const none = await call('POST', '/live/actions', watch);
    expect(none.statusCode).toBe(409);
    expect(none.body).toBe('Aucune séance en cours sur le téléphone.');

    await call('PUT', '/live', phone, { steps });
    const first = await call('POST', '/live/actions', watch);
    expect(first.headers['content-type']).toContain('text/plain');
    expect(first.body).toBe('✓ Série 1 · Squat\nRepos 1:30, puis Série 2 · Squat');
    // Second tap before the app applied anything: the next set.
    expect((await call('POST', '/live/actions', watch)).body).toBe('✓ Série 2 · Squat\nEnchaîne : Série 1 · Gainage');
    expect((await call('POST', '/live/actions', watch)).body).toContain('Plus de série prévue');
    expect((await call('POST', '/live/actions', watch)).statusCode).toBe(409);

    // The reminder goes to the phone (the device that published the session), not to the Shortcut.
    await vi.advanceTimersByTimeAsync(90_000);
    expect(sent.map((m) => m.body)).toEqual(['Série 2 · Squat']);

    const taken = (await call('POST', '/live/actions/take', phone)).json().actions;
    expect(taken).toHaveLength(3);
    expect(taken[0].at).toBeLessThanOrEqual(taken[1].at);
    expect((await call('POST', '/live/actions/take', phone)).json().actions).toEqual([]);
  });

  it('forgets everything when the session ends, and the Shortcut is a revocable device', async () => {
    const phone = await login('iPhone');
    const { token, deviceId } = (await call('POST', '/devices/shortcut', phone, { name: 'Montre' })).json();
    const watch = { authorization: `Bearer ${token}` };
    await call('PUT', '/live', phone, { steps });
    await call('POST', '/live/actions', watch);
    await call('DELETE', '/live', phone);
    expect((await call('POST', '/live/actions/take', phone)).json().actions).toEqual([]);
    expect((await call('POST', '/live/actions', watch)).statusCode).toBe(409);

    await call('DELETE', `/devices/${deviceId}`, phone);
    expect((await call('POST', '/live/actions', watch)).statusCode).toBe(401);
  });
});
