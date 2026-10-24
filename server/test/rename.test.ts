import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.ts';
import { tempDir } from './helpers.ts';

describe('former name', () => {
  it('takes over the database and the backups of an Athlos install', () => {
    const dir = tempDir();
    const old = new Database(path.join(dir, 'athlos.db'));
    old.exec("CREATE TABLE note (text TEXT); INSERT INTO note VALUES ('kept')");
    old.close();
    fs.mkdirSync(path.join(dir, 'backups'));
    fs.writeFileSync(path.join(dir, 'backups', 'athlos-2026-10-20.db'), 'x');

    const db = openDb(dir);
    try {
      expect(db.$client.prepare('SELECT text FROM note').get()).toEqual({ text: 'kept' });
      expect(fs.existsSync(path.join(dir, 'athlos.db'))).toBe(false);
      expect(fs.readdirSync(path.join(dir, 'backups'))).toEqual(['halko-2026-10-20.db']);
    } finally {
      db.$client.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
