import { and, eq, isNull, notExists, or } from 'drizzle-orm';

import type { Db } from '../db/db';
import { consents, sets, traces, user } from '../db/schema';
import { readHeader } from './header';

/** Where a trace lives in the bucket. */
const keyOf = (userId: string, setId: string) => `traces/${userId}/${setId}.sht`;

/** D1 takes 100 values a statement (each row deleted takes two); R2 deletes 1000 keys a call. */
const CHUNK = 45;

/** The traces consent in force; none once the account is deleted (its consents wait for the purge). */
const sharing = (db: Db, userId: string) =>
  db
    .select({ id: consents.id })
    .from(consents)
    .innerJoin(user, eq(user.id, consents.userId))
    .where(
      and(eq(consents.userId, userId), eq(consents.kind, 'traces'), isNull(consents.withdrawnAt)),
    );

export const sharesTraces = async (db: Db, userId: string) =>
  (await sharing(db, userId)).length > 0;

/** The account's sharing consent in force (its id, or null), and whether its set has synced. */
async function mayKeep(db: Db, userId: string, setId: string) {
  const [shared, synced] = await db.batch([
    sharing(db, userId),
    db
      .select({ id: sets.id })
      .from(sets)
      .where(and(eq(sets.userId, userId), eq(sets.id, setId))),
  ]);
  return { consentId: shared[0]?.id ?? null, synced: synced.length > 0 };
}

/** What became of a trace offered: kept, or why not. */
type TraceOutcome = 'kept' | 'sharingOff' | 'notSynced' | 'notATrace';

/**
 * Takes a set's trace file only while the account shares, for a set it has synced, from a whole file whose
 * header names that set and a `traces@` consent at capture. The file (`read`) is read only once the
 * account and the set allow it.
 */
export async function offerTrace(
  db: Db,
  bucket: R2Bucket,
  { userId, setId }: { userId: string; setId: string },
  read: () => Promise<ArrayBuffer>,
): Promise<TraceOutcome> {
  const { consentId, synced } = await mayKeep(db, userId, setId);
  if (!consentId) return 'sharingOff';
  if (!synced) return 'notSynced';
  const file = await read();
  const header = await readHeader(file);
  if (header?.setId !== setId || !header.consent.some((given) => given.startsWith('traces@'))) {
    return 'notATrace';
  }
  return (await keepTrace(db, bucket, { userId, setId, consentId }, file)) ? 'kept' : 'sharingOff';
}

/**
 * Keeps a set's trace under the consent `consentId`; false when that consent ended meanwhile (withdrawn,
 * even if given again), and then nothing is kept. The row goes first, so a deletion during the put finds
 * the file's key, and is stamped again once the file has landed, so a deletion that read it earlier
 * leaves it. A repeat writes the same file.
 */
// shortcut: a deletion racing the put and then a failed second row write leaves a file without a row; add
// a bucket listing to the sweep if R2 ever holds files that D1 doesn't.
async function keepTrace(
  db: Db,
  bucket: R2Bucket,
  { userId, setId, consentId }: { userId: string; setId: string; consentId: string },
  file: ArrayBuffer,
) {
  const row = () => {
    const stamp = { writeId: crypto.randomUUID(), bytes: file.byteLength, uploadedAt: Date.now() };
    return { stamp, write: db.insert(traces).values({ userId, setId, ...stamp }) };
  };
  await row().write.onConflictDoNothing();
  await bucket.put(keyOf(userId, setId), file);
  const landed = row();
  const [, [inForce]] = await db.batch([
    landed.write.onConflictDoUpdate({ target: [traces.userId, traces.setId], set: landed.stamp }),
    sharing(db, userId),
  ]);
  if (inForce?.id === consentId) return true;
  // A withdrawal came in while the file went up, and may have missed it.
  await bucket.delete(keyOf(userId, setId));
  await db.delete(traces).where(of(userId, [{ setId, writeId: landed.stamp.writeId }]));
  return false;
}

/** These rows of the account, each as read: a row stamped again since is another write. */
const of = (userId: string, rows: { setId: string; writeId: string }[]) =>
  and(
    eq(traces.userId, userId),
    or(...rows.map((row) => and(eq(traces.setId, row.setId), eq(traces.writeId, row.writeId)))),
  );

/** Deletes every trace of the account: the files, then the rows as read. */
// shortcut: a deletion that read its rows before sharing was given again can still delete the key of a
// file uploaded since, leaving its row with no file (a trace lost, nothing kept); fine while rare.
export async function dropTraces(db: Db, bucket: R2Bucket, userId: string) {
  const kept = await db
    .select({ setId: traces.setId, writeId: traces.writeId })
    .from(traces)
    .where(eq(traces.userId, userId));
  for (let i = 0; i < kept.length; i += CHUNK) {
    const rows = kept.slice(i, i + CHUNK);
    await bucket.delete(rows.map((row) => keyOf(userId, row.setId)));
    await db.delete(traces).where(of(userId, rows));
  }
}

/**
 * The daily sweep: traces of accounts that no longer share (a withdrawal whose deletion failed) or no
 * longer exist (deleted accounts).
 */
export async function sweepTraces(db: Db, bucket: R2Bucket) {
  const left = await db
    .selectDistinct({ userId: traces.userId })
    .from(traces)
    .where(
      or(
        notExists(db.select().from(user).where(eq(user.id, traces.userId))),
        notExists(
          db
            .select()
            .from(consents)
            .where(
              and(
                eq(consents.userId, traces.userId),
                eq(consents.kind, 'traces'),
                isNull(consents.withdrawnAt),
              ),
            ),
        ),
      ),
    );
  for (const { userId } of left) await dropTraces(db, bucket, userId);
}
