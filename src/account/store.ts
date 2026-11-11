import { eq } from 'drizzle-orm';
import { Directory, Paths } from 'expo-file-system';

import { account, writeAccount, type Account } from '@/storage/account';
import { clearDatabase } from '@/storage/clear';
import { db } from '@/storage/database';
import { challenges, runs, workouts } from '@/storage/schema';

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
 * Keeps the account that just signed in. The database holds one account's data: another account's (or what
 * was kept before accounts existed) is cleared first, in the same transaction. Files stay in their account's
 * folder, named by its id, for when it signs in again.
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

/** The server ended the session: sign in again. The account stays, so its data does too. */
export function markSignedOut() {
  const kept = account();
  if (!kept) return;
  db().transaction((tx) => writeAccount(tx, { ...kept, signedOut: true }));
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

// shortcut: only phones from before accounts have it; remove after the first release.
/** Deletes the files kept before accounts existed (`documents/local`); tried at each launch until gone. */
export function dropPreAccountFiles() {
  const local = new Directory(Paths.document, 'local');
  if (local.exists) local.delete();
}
