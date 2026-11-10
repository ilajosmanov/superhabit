import { sql } from 'drizzle-orm';

import type { Transaction } from './database';
import * as schema from './schema';

/**
 * Empties every table, a table added later too, in the caller's transaction. Foreign keys are checked when
 * it commits, so the order doesn't matter.
 */
export function clearDatabase(tx: Transaction) {
  // No Drizzle API for pragmas; this one lasts only until the transaction ends.
  tx.run(sql`PRAGMA defer_foreign_keys = ON`);
  for (const table of Object.values(schema)) tx.delete(table).run();
}
