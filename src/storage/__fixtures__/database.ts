import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { DatabaseSync } from 'node:sqlite';

import { relations } from '@/storage/relations';
import { settings } from '@/storage/schema';

// A stand-in for `@/storage/database` in Node: Node's own SQLite in memory, migrated from the same generated
// files. node:sqlite turns foreign keys on by default, like the phone's pragma. Each test file gets its own.
const opened = drizzle({ client: new DatabaseSync(':memory:'), relations });

export const db = () => opened;

/** Migrated and signed in as `local`, as the app is once startup let any screen in. */
export const migrateDatabase = async () => {
  migrate(opened, { migrationsFolder: 'src/storage/migrations' });
  const account = { id: 'local', name: 'You', image: null };
  opened.insert(settings).values({ key: 'account', value: account }).onConflictDoNothing().run();
};
