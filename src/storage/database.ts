import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';

import migrations from './migrations/migrations';
import { relations } from './relations';

function open() {
  // The change listener lets `useLiveQuery` re-run when a table changes.
  const sqlite = openDatabaseSync('superhabit.db', { enableChangeListener: true });
  try {
    // SQLite leaves foreign keys off on every new connection. Use `db().transaction` (same connection),
    // never `withExclusiveTransactionAsync`: it opens another connection without this pragma.
    sqlite.execSync('PRAGMA foreign_keys = ON');
  } catch (error) {
    sqlite.closeSync();
    throw error;
  }
  return drizzle(sqlite, { relations });
}

// Kept only once it opened, so a failed open is tried again on Retry.
let opened: ReturnType<typeof open> | null = null;

/**
 * Opens the phone's one database if it isn't yet and brings its tables up to the schema; applied
 * migrations are skipped. The startup machine calls it, so a failure shows Retry instead of a crash.
 */
export async function migrateDatabase() {
  opened ??= open();
  await migrate(opened, migrations);
}

export type Transaction = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/** The database, once startup opened it. Transactions are synchronous: no `await` inside one. */
export function db() {
  if (!opened) throw new Error('The database is used before startup opened it');
  return opened;
}
