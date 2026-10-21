import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushSettings, remindRestEnd } from '../src/lib/push.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('end-of-rest notifications', () => {
  it('asks the server only when enabled, and cancels with null', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return new Response(JSON.stringify(init?.method === 'PUT' ? { scheduled: true } : { ok: true }));
      }),
    );
    pushSettings.set({ enabled: false });
    expect(await remindRestEnd(90_000, 'Série 2 · Squat')).toBe('off');
    expect(calls).toHaveLength(0);

    pushSettings.set({ enabled: true });
    expect(await remindRestEnd(89_999.6, 'Série 2 · Squat')).toBe('scheduled');
    await remindRestEnd(null);
    expect(calls).toEqual([
      { url: '/api/v1/push/rest', method: 'PUT', body: { inMs: 90_000, body: 'Série 2 · Squat' } },
      { url: '/api/v1/push/rest', method: 'DELETE', body: undefined },
    ]);
  });

  it('tells when the server has no subscription for this device or cannot be reached', async () => {
    pushSettings.set({ enabled: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ scheduled: false }))));
    expect(await remindRestEnd(10_000)).toBe('unsubscribed');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await remindRestEnd(10_000)).toBe('offline');
  });
});
