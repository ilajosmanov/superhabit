import { and, eq } from 'drizzle-orm';
import { Directory, Paths } from 'expo-file-system';

import { account, writeAccount, type Account } from '@/storage/account';
import { clearDatabase } from '@/storage/clear';
import { writeSharing, type Sharing } from '@/storage/consent';
import { db } from '@/storage/database';
import { enqueue } from '@/storage/outbox';
import { challenges, outbox, runs, workouts } from '@/storage/schema';

/**
 * Whose data keeping `next` would clear (their name): null when another account's workouts, runs or own
 * challenges aren't here. Asked about first: until sync, this phone has the only copy.
 */
export function replacing(next: Account): string | null {
  const kept = account();
  if (!kept || kept.id === next.id) return null;
  const d = db();
  const theirs =
    d.select({ id: workouts.id }).from(workouts).limit(1).all().length > 0 ||
    d.select({ id: runs.id }).from(runs).limit(1).all().length > 0 ||
    d
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.owner, kept.id))
      .limit(1)
      .all().length > 0;
  return theirs ? kept.name : null;
}

/**
 * Keeps the account that just signed in. The database holds one account's data: another account's is
 * cleared first, in the same transaction. Files stay in their account's folder, named by its id, for when
 * it signs in again.
 */
export function keepAccount(next: Account) {
  const before = account();
  db().transaction((tx) => {
    // shortcut: unsent outbox rows go too (the session ended before they were sent); the ask before
    // replacing names whose data goes. Send them first if that is ever seen.
    if (before?.id !== next.id) clearDatabase(tx);
    writeAccount(tx, { id: next.id, name: next.name, image: next.image });
  });
}

/** Sign-ins kept since launch. Calls don't outlive the app, so memory is enough. */
let signIns = 0;

/** You signed in: the account is kept, and calls made before it no longer speak for its session. */
export function keepSignIn(next: Account) {
  keepAccount(next);
  signIns += 1;
}

/**
 * Which session a call is made in: the account, and the sign-in it came from. Read before the call; a
 * 401 marks signed out only while it is still this one (`sessionEnded`).
 */
export const sessionNow = () => `${account()?.id}:${signIns}`;

/**
 * Signed out: the server ended the session, or you did with changes still unsent (`byYou`, so the next
 * sign-in screen doesn't say the session ended). The account stays, so its data does too.
 */
export function markSignedOut(byYou = false) {
  const kept = account();
  if (!kept) return;
  db().transaction((tx) =>
    writeAccount(tx, { ...kept, signedOut: true, byYou: byYou || kept.byYou }),
  );
}

/**
 * You signed out (Profile sent what was waiting first): the database is cleared, the account with it, so the
 * next sign-in starts empty and pulls what the server holds. Files stay in the account's folder for then.
 */
export function clearSignedOut() {
  db().transaction((tx) => clearDatabase(tx));
}

/**
 * The account was deleted on the server: everything of it goes from this phone too, the database (the kept
 * account with it, so the next sign-in is a first one) and its folder of videos and traces.
 */
export function forgetAccount() {
  const kept = account();
  // The folder first: once the account row is gone, nothing would know whose folder it was.
  if (kept) {
    const folder = new Directory(Paths.document, kept.id);
    if (folder.exists) folder.delete();
  }
  db().transaction((tx) => clearDatabase(tx));
}

/** A withdrawal of sharing the server hasn't heard yet. */
const queuedWithdrawal = and(eq(outbox.entity, 'consent'), eq(outbox.entityId, 'traces'));

/** Keeps your answer to sharing on this phone. */
export const keepSharing = (answer: Sharing) => db().transaction((tx) => writeSharing(tx, answer));

/** A yes the server took, kept here; a withdrawal still queued goes with it, or it would undo the yes. */
export function keepGrant(policyVersion: string) {
  db().transaction((tx) => {
    writeSharing(tx, { traces: true, policyVersion });
    tx.delete(outbox).where(queuedWithdrawal).run();
  });
}

/** A no, and its withdrawal queued for the server: kept or lost together. */
export function keepWithdrawal(policyVersion: string) {
  db().transaction((tx) => {
    writeSharing(tx, { traces: false, policyVersion });
    enqueue(tx, { entity: 'consent', entityId: 'traces', op: 'withdraw', data: { policyVersion } });
  });
}

/** Whether a withdrawal waits for the server. */
export const withdrawalQueued = () =>
  db().select({ id: outbox.id }).from(outbox).where(queuedWithdrawal).get() !== undefined;

/** The server heard the withdrawal. */
export const dropWithdrawal = () => db().delete(outbox).where(queuedWithdrawal).run();
