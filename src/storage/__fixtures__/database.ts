import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { DatabaseSync } from 'node:sqlite';

import { relations } from '@/storage/relations';

// A stand-in for `@/storage/database` in Node: Node's own SQLite in memory, migrated from the same generated
// files. node:sqlite turns foreign keys on by default, like the phone's pragma. Each test file gets its own.
const opened = drizzle({ client: new DatabaseSync(':memory:'), relations });

export const db = () => opened;

export const migrateDatabase = async () => {
  migrate(opened, { migrationsFolder: 'src/storage/migrations' });
};
