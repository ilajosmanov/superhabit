import { eq } from 'drizzle-orm';

import { db, type Transaction } from './database';
import { settings } from './schema';

/**
 * Who signed in on this phone, as the server knows them, and so whose data the database holds. Kept after
 * the server ends the session (`signedOut`): the data stays theirs until someone signs in. The rules for
 * keeping it are the account feature's (`account/store.ts`).
 */
export type Account = {
  id: string;
  name: string;
  image: string | null;
  signedOut?: boolean;
  /** Signed out by you (Sign out, with changes unsent), not by the server. */
  byYou?: boolean;
};

const KEY = 'account';

/** The account row; a live query on it keeps the shared snapshot's `you` current. */
export const accountRows = () => db().select().from(settings).where(eq(settings.key, KEY));

/** A kept account from its stored value. Unreadable is not "nobody": read as a first sign-in, it would clear the data. */
export function readAccount(value: unknown): Account {
  const fail = () => new Error('The kept account is unreadable');
  if (typeof value !== 'object' || value === null) throw fail();
  if (!('id' in value && 'name' in value && 'image' in value)) throw fail();
  const { id, name, image } = value;
  if (typeof id !== 'string' || typeof name !== 'string') throw fail();
  if (image !== null && typeof image !== 'string') throw fail();
  const signedOut = 'signedOut' in value && value.signedOut === true;
  const byYou = 'byYou' in value && value.byYou === true;
  return { id, name, image, signedOut, byYou };
}

/** The account kept on this phone, or null before the first sign-in. */
export function account(): Account | null {
  const row = accountRows().get();
  return row ? readAccount(row.value) : null;
}

/** Whose data this is: stamped on what is kept and naming the files' folder. */
export function userId() {
  const kept = account();
  if (!kept) throw new Error('Nothing is kept before sign-in');
  return kept.id;
}

/** Writes the kept account, in the caller's transaction. */
export function writeAccount(tx: Transaction, value: Account) {
  tx.insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
