import { eq, inArray, isNull } from 'drizzle-orm';

import { consentsInForce } from '../consents/store';
import type { Db } from '../db/db';
import { consents, deletions, user } from '../db/schema';

/** You: your name and photo, as Google gave them, and the consents in force. */
export async function me(db: Db, userId: string) {
  const [[you], consents] = await db.batch([
    db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(user)
      .where(eq(user.id, userId)),
    consentsInForce(db, userId),
  ]);
  return { ...you, consents };
}

/**
 * Deletes an account. The user row goes now, and its sessions and Google link with it, so every phone is
 * signed out and the same Google account comes back as a new user. The rest waits for `purgeDeleted`.
 */
export const deleteAccount = (db: Db, userId: string) =>
  db.batch([
    // A second Delete at once finds the user gone and adds nothing.
    db.insert(deletions).values({ userId, requestedAt: Date.now() }).onConflictDoNothing(),
    db.delete(user).where(eq(user.id, userId)),
  ]);

/** Deletes what deleted accounts left (their consents, for now), all due at once, in one transaction. */
export function purgeDeleted(db: Db) {
  const due = db
    .select({ userId: deletions.userId })
    .from(deletions)
    .where(isNull(deletions.purgedAt));
  return db.batch([
    db.delete(consents).where(inArray(consents.userId, due)),
    db.update(deletions).set({ purgedAt: Date.now() }).where(isNull(deletions.purgedAt)),
  ]);
}
