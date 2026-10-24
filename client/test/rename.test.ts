import { describe, expect, it } from 'vitest';
import { HalkoDb } from '../src/db/db.ts';

describe('former name', () => {
  it('moves the settings and the local data kept under the name Athlos', async () => {
    localStorage.setItem('athlos.token', 'old-token');
    localStorage.setItem('athlos.sound', '{"volume":0.7}');
    localStorage.setItem('halko.sound', '{"volume":0.2}');
    const { moveLocalDatabase } = await import('../src/lib/rename.ts');
    expect(localStorage.getItem('halko.token')).toBe('old-token');
    // A value already under the new name wins.
    expect(localStorage.getItem('halko.sound')).toBe('{"volume":0.2}');
    expect(Object.keys(localStorage).filter((k) => k.startsWith('athlos.'))).toEqual([]);

    const old = new HalkoDb('athlos-test');
    await old.meta.put({ key: 'syncRev', value: 7 });
    await old.workouts.add({ id: 'w1', name: 'Jambes', position: 0 } as never);
    old.close();
    const db = new HalkoDb('halko-test');
    await moveLocalDatabase(db, 'athlos-test');
    expect((await db.meta.get('syncRev'))?.value).toBe(7);
    expect((await db.workouts.get('w1'))?.name).toBe('Jambes');
    expect(await HalkoDb.exists('athlos-test')).toBe(false);
  });
});
