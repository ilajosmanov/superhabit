import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Days are local 'YYYY-MM-DD' text, instants Unix ms integers. JSON columns hold `unknown`: the feature that
// owns them parses them with its own schema. `vp exec drizzle-kit generate` after any change here.
// Text keys are table-level `primaryKey`s on `notNull` columns: drizzle-kit 1.0 RC writes an inline text
// `.primaryKey()` without NOT NULL, and SQLite then takes a NULL key.

export const challenges = sqliteTable(
  'challenges',
  {
    id: text('id').notNull(),
    /** 'superhabit' for ours, else the user id. */
    owner: text('owner').notNull(),
    visibility: text('visibility', { enum: ['private', 'public'] }).notNull(),
    // No foreign key: versions point at their challenge, so this one would make a cycle. The feature's
    // transaction keeps it valid.
    currentVersionId: text('current_version_id').notNull(),
    retiredAt: integer('retired_at'),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    check('challenges_visibility', sql`${t.visibility} in ('private', 'public')`),
  ],
);

/** A challenge's content at one point. Rows are only ever added, never edited. */
export const challengeVersions = sqliteTable(
  'challenge_versions',
  {
    id: text('id').notNull(),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id),
    /** For display only. */
    number: integer('number').notNull(),
    name: text('name').notNull(),
    days: integer('days').notNull(),
    dailyTotal: integer('daily_total', { mode: 'boolean' }).notNull(),
    restartOnMiss: integer('restart_on_miss', { mode: 'boolean' }).notNull(),
    /** The session tree. */
    plan: text('plan', { mode: 'json' }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.id] }), index('challenge_versions_challenge').on(t.challengeId)],
);

/** You doing one challenge. Finished, missed and restarts are worked out from the workouts, not stored. */
export const runs = sqliteTable(
  'runs',
  {
    id: text('id').notNull(),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id),
    /** Null follows the challenge's current version. */
    pinnedVersionId: text('pinned_version_id').references(() => challengeVersions.id),
    groupChallengeId: text('group_challenge_id'),
    startedOn: text('started_on').notNull(),
    endedOn: text('ended_on'),
    endReason: text('end_reason', { enum: ['left'] }),
  },
  (t) => [primaryKey({ columns: [t.id] }), index('runs_challenge').on(t.challengeId)],
);

export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').notNull(),
    /** Null for a free log. */
    runId: text('run_id').references(() => runs.id),
    versionId: text('version_id').references(() => challengeVersions.id),
    /** The local day it started on, never recomputed. */
    day: text('day').notNull(),
    status: text('status', { enum: ['open', 'done'] }).notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    /** Minutes east of UTC at the start. */
    tzOffsetMin: integer('tz_offset_min').notNull(),
    /** IANA zone at the start. */
    tz: text('tz').notNull(),
    appVersion: text('app_version').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    check('workouts_status', sql`${t.status} in ('open', 'done')`),
    // At most one workout in progress.
    uniqueIndex('workouts_one_open')
      .on(t.status)
      .where(sql`${t.status} = 'open'`),
    index('workouts_run_day').on(t.runId, t.day),
    index('workouts_day').on(t.day),
  ],
);

export const sets = sqliteTable(
  'sets',
  {
    id: text('id').notNull(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    /** Index into `expand(session)`. */
    planStep: integer('plan_step').notNull(),
    exercise: text('exercise').notNull(),
    goal: text('goal', { mode: 'json' }).notNull(),
    reps: integer('reps').notNull(),
    noReps: integer('no_reps').notNull(),
    heldMs: integer('held_ms').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at').notNull(),
    counterVersion: text('counter_version').notNull(),
    /** Every attempt: start, bottom and end ms, depth, cue, counted. */
    attempts: text('attempts', { mode: 'json' }).notNull(),
    metrics: text('metrics', { mode: 'json' }),
  },
  // One row per planned step: the day rules match sets by step and daily totals sum rows, so a duplicate
  // would count twice. Also serves "sets of a workout".
  (t) => [
    primaryKey({ columns: [t.id] }),
    uniqueIndex('sets_workout_step').on(t.workoutId, t.planStep),
  ],
);

export const streakEvents = sqliteTable(
  'streak_events',
  {
    /** `kind:day`. */
    id: text('id').notNull(),
    day: text('day').notNull(),
    kind: text('kind', { enum: ['earned', 'used'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    check('streak_events_kind', sql`${t.kind} in ('earned', 'used')`),
  ],
);

export const settings = sqliteTable(
  'settings',
  {
    key: text('key').notNull(),
    value: text('value', { mode: 'json' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.key] })],
);

/** Changes waiting to be sent to the server, written in the same transaction as the change. */
export const outbox = sqliteTable('outbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  op: text('op').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  createdAt: integer('created_at').notNull(),
  tries: integer('tries').notNull().default(0),
  /** Why the server refused it: parked, never sent again. */
  lastError: text('last_error'),
});

/** How far each server stream has been read (`account/sync.ts`). */
export const syncCursors = sqliteTable(
  'sync_cursors',
  {
    stream: text('stream').notNull(),
    cursor: text('cursor').notNull(),
  },
  (t) => [primaryKey({ columns: [t.stream] })],
);
