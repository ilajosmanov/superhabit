import { expect, it, vi } from 'vite-plus/test';

import { db, migrateDatabase } from './database';

// The native database: its first open fails, like a full or locked disk.
const sqlite = vi.hoisted(() => ({ opens: 0 }));
vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => {
    sqlite.opens += 1;
    if (sqlite.opens === 1) throw new Error('unable to open database file');
    return { execSync: () => {}, closeSync: () => {} };
  },
}));
vi.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({ opened: true }) }));
vi.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: async () => {} }));
vi.mock('./migrations/migrations', () => ({ default: { migrations: {} } }));

it('opens again after a failed open, and keeps the database once it opened', async () => {
  await expect(migrateDatabase()).rejects.toThrow('unable to open database file');
  expect(() => db()).toThrow('before startup opened it');

  await migrateDatabase();
  await migrateDatabase();

  expect(db()).toEqual({ opened: true });
  expect(sqlite.opens).toBe(2);
});
