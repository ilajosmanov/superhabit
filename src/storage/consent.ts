import { eq } from 'drizzle-orm';

import { db, type Transaction } from './database';
import { settings } from './schema';

const KEY = 'consent';

/**
 * Whether you share your traces (the points of your reps) to train the counter, and under which privacy
 * policy, as answered on this phone; null when not asked here yet. The server keeps the proof; the rules
 * are the account feature's.
 */
export type Sharing = { traces: boolean; policyVersion: string };

/** The answer's row; a live query on it keeps the shared snapshot's `sharing` current. */
export const sharingRows = () => db().select().from(settings).where(eq(settings.key, KEY));

/** The answer from its stored value; null when there is none, or it can't be read (asked again then). */
export function readSharing(value: unknown): Sharing | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('traces' in value && 'policyVersion' in value)) return null;
  const { traces, policyVersion } = value;
  if (typeof traces !== 'boolean' || typeof policyVersion !== 'string') return null;
  return { traces, policyVersion };
}

export const sharing = () => readSharing(sharingRows().get()?.value);

/** Keeps the answer, in the caller's transaction. */
export function writeSharing(tx: Transaction, value: Sharing) {
  tx.insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** The consents in force, as a trace file records them at capture: `traces@<policy version>`. */
export function consentsGiven(): string[] {
  const answer = sharing();
  return answer?.traces ? [`traces@${answer.policyVersion}`] : [];
}

/** Whether a trace recorded under these consents may be shared. */
export const coversTraces = (consent: readonly string[]) =>
  consent.some((given) => given.startsWith('traces@'));
