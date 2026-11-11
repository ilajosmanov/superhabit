import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import { authClient } from './auth-client';
import { tellWithdrawal } from './consent';
import { SERVER_URL, SessionGone } from './server';
import { oneAtATime } from '@/lib/one-at-a-time';
import { account } from '@/storage/account';
import { db } from '@/storage/database';
import {
  challengeVersions,
  challenges,
  outbox,
  runs,
  sets,
  settings,
  streakEvents,
  syncCursors,
  workouts,
} from '@/storage/schema';

/** Over the server's 1 MB a request. */
class TooLarge extends Error {}

/** Outbox rows a send carries (the server takes 50): ten long workouts stay well under its 1 MB. */
const BATCH = 10;
const CURSOR = 'changes';
/** Set once a pull reached the end; cleared with the database. */
const PULLED = 'pulled';

type Result = { ok: true } | { ok: false; reason: string };
type Pulled =
  | { entity: 'challenge'; row: typeof challenges.$inferInsert }
  | { entity: 'challenge_version'; row: typeof challengeVersions.$inferInsert }
  | { entity: 'run'; row: typeof runs.$inferInsert }
  | {
      entity: 'workout';
      row: typeof workouts.$inferInsert & { sets: (typeof sets.$inferInsert)[] };
    }
  | { entity: 'streak_event'; row: typeof streakEvents.$inferInsert };
type Page = { rows: Pulled[]; cursor: number; more: boolean };

async function call<T>(path: string, init?: { method: 'POST'; body: object }) {
  const { data, error } = await authClient.$fetch<T>(`${SERVER_URL}${path}`, init);
  if (error?.status === 401) throw new SessionGone();
  if (error?.status === 413) throw new TooLarge();
  if (error || !data) throw new Error(error?.message ?? `${path}: no answer`);
  return data;
}

// The outbox minus what consent.ts sends itself, and minus rows the server refused.
const waiting = and(isNull(outbox.lastError), ne(outbox.entity, 'consent'));

/**
 * Sends the outbox, oldest first, until nothing is waiting. A taken row leaves the outbox; a refused one is
 * parked with the server's reason and the rest go on. A batch over the server's 1 MB is sent again a row at
 * a time. Throws when the server can't be reached.
 */
async function sendAll() {
  const owner = account()?.id;
  // Signed out before this turn came: nothing here is anyone's.
  if (!owner) return;
  await tellWithdrawal();
  let batch = BATCH;
  for (;;) {
    const rows = db()
      .select()
      .from(outbox)
      .where(waiting)
      .orderBy(asc(outbox.id))
      .limit(batch)
      .all();
    if (rows.length === 0) return;
    const answer = await call<{ results: Result[] }>('/sync', {
      method: 'POST',
      body: {
        changes: rows.map(({ entity, entityId, op, payload }) => ({
          entity,
          entityId,
          op,
          payload,
        })),
      },
    }).catch((error: unknown) => {
      if (error instanceof TooLarge) return null;
      throw error;
    });
    // Signed out meanwhile: these rows are gone with the database.
    if (account()?.id !== owner) return;
    // Over 1 MB: one row at a time from here, and a row too large alone is refused like any other.
    if (!answer && rows.length > 1) {
      batch = 1;
      continue;
    }
    const results = answer?.results ?? [{ ok: false, reason: 'over 1 MB' }];
    db().transaction((tx) => {
      rows.forEach((row, i) => {
        const result = results[i];
        if (result?.ok) tx.delete(outbox).where(eq(outbox.id, row.id)).run();
        else {
          const reason = result?.reason ?? 'no answer';
          console.warn('[sync] refused', row.entity, row.op, reason);
          tx.update(outbox).set({ lastError: reason }).where(eq(outbox.id, row.id)).run();
        }
      });
    });
  }
}

/** Keeps a pulled page and its cursor together. A row with a change of this phone's still waiting is skipped. */
function keepPage({ rows, cursor, more }: Page) {
  const d = db();
  const mine = new Set(
    d
      .select({ entity: outbox.entity, entityId: outbox.entityId })
      .from(outbox)
      .all()
      .map((row) => `${row.entity}:${row.entityId}`),
  );
  // Rows come in the order the server last wrote them, so an edited challenge can come after its runs, maybe
  // a page later; the whole pull is complete. SQLite only changes this outside a transaction, and nothing
  // else writes in between: writes are synchronous.
  d.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    d.transaction((tx) => {
      for (const { entity, row } of rows) {
        if (mine.has(`${entity}:${row.id}`)) continue;
        if (entity === 'challenge') {
          const { currentVersionId, visibility } = row;
          tx.insert(challenges)
            .values(row)
            .onConflictDoUpdate({ target: challenges.id, set: { currentVersionId, visibility } })
            .run();
        } else if (entity === 'challenge_version') {
          tx.insert(challengeVersions).values(row).onConflictDoNothing().run();
        } else if (entity === 'run') {
          const { endedOn, endReason } = row;
          tx.insert(runs)
            .values(row)
            .onConflictDoUpdate({ target: runs.id, set: { endedOn, endReason } })
            .run();
        } else if (entity === 'workout') {
          const { sets: done, ...workout } = row;
          tx.insert(workouts).values(workout).onConflictDoNothing().run();
          for (const set of done) tx.insert(sets).values(set).onConflictDoNothing().run();
        } else if (entity === 'streak_event') {
          tx.insert(streakEvents).values(row).onConflictDoNothing().run();
        }
      }
      tx.insert(syncCursors)
        .values({ stream: CURSOR, cursor: String(cursor) })
        .onConflictDoUpdate({ target: syncCursors.stream, set: { cursor: String(cursor) } })
        .run();
      if (!more)
        tx.insert(settings).values({ key: PULLED, value: true }).onConflictDoNothing().run();
    });
  } finally {
    d.run(sql`PRAGMA foreign_keys = ON`);
  }
}

/** Pulls the account's rows written since the last pull, page by page; an interrupted pull resumes. */
async function pullAll() {
  const owner = account()?.id;
  if (!owner) return;
  for (;;) {
    const after =
      db().select().from(syncCursors).where(eq(syncCursors.stream, CURSOR)).get()?.cursor ?? '0';
    const page = await call<Page>(`/sync?after=${after}`);
    if (account()?.id !== owner) return;
    keepPage(page);
    if (!page.more) return;
  }
}

// One round at a time, so a pull never lands between a send reaching the server and the phone hearing it.
const inTurn = oneAtATime();

/** Sends what's waiting. Throws `SessionGone`, or when the server can't be reached. */
export const send = () => inTurn(sendAll);

/** Sends what's waiting, then pulls, so a change made here wins until the server has it. */
export const sync = () =>
  inTurn(async () => {
    await sendAll();
    await pullAll();
  });

/**
 * A pull reached the end since the database was last cleared: what the server holds is here. Until then a
 * video without a set may be one a pull is still bringing back.
 */
export const restored = () =>
  db().select().from(settings).where(eq(settings.key, PULLED)).get() !== undefined;

/** Changes the server refused (our bug, never the network): signing out loses them. */
export const refused = () =>
  db().select({ id: outbox.id }).from(outbox).where(isNotNull(outbox.lastError)).all().length;

/** Changes not on the server yet, refused ones aside: signing out must not lose them. */
export const unsent = () =>
  db().select({ id: outbox.id }).from(outbox).where(isNull(outbox.lastError)).all().length;

/** Workouts not on the server yet. */
export const unsentWorkouts = () =>
  db()
    .select({ id: outbox.id })
    .from(outbox)
    .where(and(eq(outbox.entity, 'workout'), isNull(outbox.lastError)))
    .all().length;
