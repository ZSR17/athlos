import { describe, expect, it } from 'vitest';
import { ipInCidrs } from '../src/lib/ip.ts';
import { TEST_PASSWORD, makeTestApp } from './helpers.ts';

describe('ipInCidrs', () => {
  it('matches IPv4 and IPv4-mapped IPv6 addresses', () => {
    expect(ipInCidrs('192.168.1.42', ['192.168.1.0/24'])).toBe(true);
    expect(ipInCidrs('::ffff:192.168.1.42', ['192.168.1.0/24'])).toBe(true);
    expect(ipInCidrs('10.8.0.2', ['192.168.1.0/24'])).toBe(false);
    expect(ipInCidrs('172.26.0.5', ['172.16.0.0/12'])).toBe(true);
    expect(ipInCidrs('fe80::1', ['192.168.1.0/24'])).toBe(false);
    expect(ipInCidrs('1.2.3.4', ['0.0.0.0/0'])).toBe(true);
  });
});

describe('GET /api/v1/network', () => {
  it('uses the client address forwarded by the trusted proxy', async () => {
    const ctx = await makeTestApp();
    try {
      const { token } = (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { password: TEST_PASSWORD, deviceName: 'iPhone' },
        })
      ).json();
      const call = (forwardedFor: string) =>
        ctx.app.inject({
          method: 'GET',
          url: '/api/v1/network',
          remoteAddress: '172.26.0.2',
          headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': forwardedFor },
        });
      expect((await call('192.168.1.20')).json()).toEqual({ location: 'home' });
      expect((await call('10.8.0.2')).json()).toEqual({ location: 'remote' });
    } finally {
      await ctx.cleanup();
    }
  });
});
