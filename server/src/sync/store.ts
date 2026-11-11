import { and, asc, eq, exists, gt, inArray, isNull } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import type { Db } from '../db/db';
import {
  challengeVersions,
  challenges,
  changes,
  deletions,
  runs,
  sets,
  streakEvents,
  workouts,
} from '../db/schema';
import type { Change } from './changes';

type Entity = (typeof changes.$inferInsert)['entity'];

/**
 * Keeps a phone's changes, in order, in one transaction. Facts (challenge versions, runs, workouts with their
 * sets, freezes) are kept as first sent, so a repeat changes nothing. Only the account's own rows change: a
 * run's end, once (the first leave stands), and a challenge's current version, to the newest version the
 * server took. A log entry can name a row that doesn't exist (an edit of someone else's challenge): pulls
 * skip it.
 */
// shortcut: trusts the phone to make a fresh uuid per row and never change a sent one; a client that reuses ids
// can only muddle its own account's rows. Check stored ownership per row if a shared (group) table ever relies on it.
export async function applyChanges(db: Db, userId: string, list: Change[]) {
  const receivedAt = Date.now();
  // Each row written moves to the end of the changes log, where the account's other phones pull it from.
  const logged = (entity: Entity, entityId: string) => [
    db
      .delete(changes)
      .where(
        and(eq(changes.userId, userId), eq(changes.entity, entity), eq(changes.entityId, entityId)),
      ),
    db.insert(changes).values({ userId, entity, entityId }),
  ];
  const keepVersion = (version: Extract<Change, { op: 'edit' }>['payload']['version']) => [
    db
      .insert(challengeVersions)
      .values({ ...version, userId, receivedAt })
      .onConflictDoNothing(),
    ...logged('challenge_version', version.id),
  ];
  const yours = <T extends typeof challenges | typeof runs>(table: T, id: string) =>
    and(eq(table.userId, userId), eq(table.id, id));

  const statements: BatchItem<'sqlite'>[] = list.flatMap((c): BatchItem<'sqlite'>[] => {
    switch (c.op) {
      case 'create':
        return [
          db
            .insert(challenges)
            .values({
              userId,
              id: c.entityId,
              visibility: c.payload.visibility,
              currentVersionId: c.payload.currentVersionId,
              receivedAt,
            })
            .onConflictDoNothing(),
          ...keepVersion(c.payload.version),
          ...logged('challenge', c.entityId),
        ];
      case 'edit':
        return [
          ...keepVersion(c.payload.version),
          // Only to a version of this challenge that this request added: a resent old edit must not undo a
          // newer one, nor take another challenge's version.
          db
            .update(challenges)
            .set({ currentVersionId: c.payload.version.id })
            .where(
              and(
                yours(challenges, c.entityId),
                exists(
                  db
                    .select()
                    .from(challengeVersions)
                    .where(
                      and(
                        eq(challengeVersions.userId, userId),
                        eq(challengeVersions.id, c.payload.version.id),
                        eq(challengeVersions.challengeId, c.entityId),
                        eq(challengeVersions.receivedAt, receivedAt),
                      ),
                    ),
                ),
              ),
            ),
          ...logged('challenge', c.entityId),
        ];
      case 'join':
        return [
          db
            .insert(runs)
            .values({ ...c.payload, userId, receivedAt })
            .onConflictDoNothing(),
          ...logged('run', c.entityId),
        ];
      case 'leave':
        return [
          // The first leave stands; another phone leaving the same run later changes nothing.
          db
            .update(runs)
            .set(c.payload)
            .where(and(yours(runs, c.entityId), isNull(runs.endedOn))),
          ...logged('run', c.entityId),
        ];
      case 'done': {
        const { sets: rows, ...workout } = c.payload.workout;
        return [
          db
            .insert(workouts)
            .values({ ...workout, userId, receivedAt })
            .onConflictDoNothing(),
          // One statement a set: a statement takes at most 100 values.
          ...rows.map((set) =>
            db
              .insert(sets)
              .values({ ...set, userId, receivedAt })
              .onConflictDoNothing(),
          ),
          ...logged('workout', c.entityId),
        ];
      }
      case 'add':
        return [
          db
            .insert(streakEvents)
            .values({ ...c.payload.event, userId, receivedAt })
            .onConflictDoNothing(),
          ...logged('streak_event', c.entityId),
        ];
    }
  });
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
}

const SERVER_ONLY = new Set(['userId', 'receivedAt']);
/** A row as the phone keeps it: without whose it is and when it arrived. */
const kept = (row: object) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !SERVER_ONLY.has(key)));

/** Log entries a pull page reads; a workout's sets come with it. */
export const PULL_PAGE = 50;

/**
 * The account's rows written after `after` (a `seq`), in log order, each as the phone keeps it; `cursor` is
 * where the next page starts. Entries naming a row that doesn't exist are skipped.
 */
export async function changesAfter(db: Db, userId: string, after: number) {
  const log = await db
    .select()
    .from(changes)
    .where(and(eq(changes.userId, userId), gt(changes.seq, after)))
    .orderBy(asc(changes.seq))
    .limit(PULL_PAGE);
  const ids = (entity: Entity) => log.filter((e) => e.entity === entity).map((e) => e.entityId);
  const workoutIds = ids('workout');
  // One D1 call; each `in` list stays under D1's 100 values a statement.
  const [challengeRows, versionRows, runRows, workoutRows, setRows, eventRows] = await db.batch([
    db
      .select()
      .from(challenges)
      .where(and(eq(challenges.userId, userId), inArray(challenges.id, ids('challenge')))),
    db
      .select()
      .from(challengeVersions)
      .where(
        and(
          eq(challengeVersions.userId, userId),
          inArray(challengeVersions.id, ids('challenge_version')),
        ),
      ),
    db
      .select()
      .from(runs)
      .where(and(eq(runs.userId, userId), inArray(runs.id, ids('run')))),
    db
      .select()
      .from(workouts)
      .where(and(eq(workouts.userId, userId), inArray(workouts.id, workoutIds))),
    db
      .select()
      .from(sets)
      .where(and(eq(sets.userId, userId), inArray(sets.workoutId, workoutIds))),
    db
      .select()
      .from(streakEvents)
      .where(and(eq(streakEvents.userId, userId), inArray(streakEvents.id, ids('streak_event')))),
  ]);
  const stored = new Map<string, object>([
    ...challengeRows.map(
      (row) => [`challenge:${row.id}`, { ...kept(row), owner: row.userId }] as const,
    ),
    ...versionRows.map((row) => [`challenge_version:${row.id}`, kept(row)] as const),
    ...runRows.map((row) => [`run:${row.id}`, kept(row)] as const),
    ...workoutRows.map(
      (row) =>
        [
          `workout:${row.id}`,
          {
            ...kept(row),
            status: 'done',
            sets: setRows.filter((set) => set.workoutId === row.id).map(kept),
          },
        ] as const,
    ),
    ...eventRows.map((row) => [`streak_event:${row.id}`, kept(row)] as const),
  ]);
  return {
    rows: log.flatMap(({ entity, entityId }) => {
      const row = stored.get(`${entity}:${entityId}`);
      return row ? [{ entity, row }] : [];
    }),
    cursor: log.at(-1)?.seq ?? after,
    more: log.length === PULL_PAGE,
  };
}

/** Every deleted account's synced rows. All deletions each time: a sync that raced its deletion is caught. */
export function purgeSynced(db: Db) {
  const deleted = db.select({ userId: deletions.userId }).from(deletions);
  return [challenges, challengeVersions, runs, workouts, sets, streakEvents, changes].map((table) =>
    db.delete(table).where(inArray(table.userId, deleted)),
  );
}
