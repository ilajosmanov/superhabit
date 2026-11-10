import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Better Auth's own tables (user, session, account, verification) are generated into `auth-schema.ts`.
export * from './auth-schema';

// Instants are Unix ms integers, as on the phone. `vp exec drizzle-kit generate` after any change here.
// No foreign key to `user`: these rows outlive the account until the daily purge.

/** Proof of consent: a row per grant; withdrawing stamps `withdrawn_at`. One in force per kind. */
export const consents = sqliteTable(
  'consents',
  {
    id: text('id').notNull(),
    userId: text('user_id').notNull(),
    kind: text('kind', { enum: ['traces', 'video'] }).notNull(),
    policyVersion: text('policy_version').notNull(),
    grantedAt: integer('granted_at').notNull(),
    withdrawnAt: integer('withdrawn_at'),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    uniqueIndex('consents_in_force')
      .on(t.userId, t.kind)
      .where(sql`${t.withdrawnAt} is null`),
    check('consents_kind', sql`${t.kind} in ('traces', 'video')`),
  ],
);

/** Deleted accounts: sign-in rows go at once, the rest when the daily purge stamps `purged_at`. */
export const deletions = sqliteTable(
  'deletions',
  {
    userId: text('user_id').notNull(),
    requestedAt: integer('requested_at').notNull(),
    purgedAt: integer('purged_at'),
  },
  (t) => [primaryKey({ columns: [t.userId] })],
);
