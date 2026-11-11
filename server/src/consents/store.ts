import { and, eq, inArray, isNull, ne, notExists, sql } from 'drizzle-orm';

import type { Db } from '../db/db';
import { consents, deletions, user } from '../db/schema';
import { dropTraces, sharesTraces } from '../traces/store';

export type ConsentKind = (typeof consents.$inferSelect)['kind'];

/** The consents in force: one per kind at most. */
export const consentsInForce = (db: Db, userId: string) =>
  db
    .select({
      kind: consents.kind,
      policyVersion: consents.policyVersion,
      grantedAt: consents.grantedAt,
    })
    .from(consents)
    .where(and(eq(consents.userId, userId), isNull(consents.withdrawnAt)));

type ConsentChange = { kind: ConsentKind; policyVersion: string; granted: boolean };

/**
 * Gives or withdraws a consent, and what goes with it: withdrawing traces deletes those shared (the daily
 * sweep catches a deletion that fails here), and sharing again after a withdrawal whose deletion failed
 * deletes those traces first.
 */
export async function changeConsent(
  db: Db,
  bucket: R2Bucket,
  userId: string,
  change: ConsentChange,
) {
  if (change.kind === 'traces' && change.granted && !(await sharesTraces(db, userId))) {
    await dropTraces(db, bucket, userId);
  }
  await setConsent(db, userId, change);
  if (change.kind === 'traces' && !change.granted) await dropTraces(db, bucket, userId);
}

/**
 * Gives (`granted`) or withdraws the consent of `kind`. Giving the one in force again changes nothing; a new
 * policy replaces it. Every grant stays as proof, stamped when replaced or withdrawn.
 */
async function setConsent(db: Db, userId: string, { kind, policyVersion, granted }: ConsentChange) {
  const now = Date.now();
  const inForce = and(
    eq(consents.userId, userId),
    eq(consents.kind, kind),
    isNull(consents.withdrawnAt),
  );
  const withdraw = db
    .update(consents)
    .set({ withdrawnAt: now })
    .where(granted ? and(inForce, ne(consents.policyVersion, policyVersion)) : inForce);
  if (!granted) return withdraw;
  // In the same transaction, and only while the account exists and none is in force: a double tap adds one
  // grant, and a grant racing the account's deletion adds none.
  const grant = db.insert(consents).select(
    db
      .select({
        id: sql<string>`${crypto.randomUUID()}`.as('id'),
        userId: user.id,
        kind: sql<ConsentKind>`${kind}`.as('kind'),
        policyVersion: sql<string>`${policyVersion}`.as('policy_version'),
        grantedAt: sql<number>`${now}`.as('granted_at'),
        withdrawnAt: sql<null>`null`.as('withdrawn_at'),
      })
      .from(user)
      .where(and(eq(user.id, userId), notExists(db.select().from(consents).where(inForce)))),
  );
  return db.batch([withdraw, grant]);
}

/** Deletes the deleted accounts' consents: a statement for `purgeDeleted`'s one batch. */
export function purgeConsents(db: Db) {
  const deleted = db.select({ userId: deletions.userId }).from(deletions);
  return db.delete(consents).where(inArray(consents.userId, deleted));
}
