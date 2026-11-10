import { and, eq, isNull, ne, notExists, sql } from 'drizzle-orm';

import type { Db } from '../db/db';
import { consents, user } from '../db/schema';

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

/**
 * Gives (`granted`) or withdraws the consent of `kind`. Giving the one in force again changes nothing; a new
 * policy replaces it. Every grant stays as proof, stamped when replaced or withdrawn.
 */
export async function setConsent(
  db: Db,
  userId: string,
  { kind, policyVersion, granted }: { kind: ConsentKind; policyVersion: string; granted: boolean },
) {
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
