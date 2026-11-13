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

// Better Auth's own tables (user, session, account, verification) are generated into `auth-schema.ts`.
export * from './auth-schema';

// Instants are Unix ms integers, as on the phone. `vp exec drizzle-kit generate` after any change here.
// No foreign key to `user`: these rows outlive the account until the daily purge.

/** Proof of consent: a row per grant; withdrawing stamps `withdrawn_at`. One in force per kind. */
export const consents = sqliteTable(
  'consents',
  {
    id: text('id').notNull(),
    userId: text('user_id').notNull(),
    kind: text('kind', { enum: ['traces', 'video'] }).notNull(),
    policyVersion: text('policy_version').notNull(),
    grantedAt: integer('granted_at').notNull(),
    withdrawnAt: integer('withdrawn_at'),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    uniqueIndex('consents_in_force')
      .on(t.userId, t.kind)
      .where(sql`${t.withdrawnAt} is null`),
    check('consents_kind', sql`${t.kind} in ('traces', 'video')`),
  ],
);

/** Deleted accounts: sign-in rows go at once, the rest when the daily purge stamps `purged_at`. */
export const deletions = sqliteTable(
  'deletions',
  {
    userId: text('user_id').notNull(),
    requestedAt: integer('requested_at').notNull(),
    purgedAt: integer('purged_at'),
  },
  (t) => [primaryKey({ columns: [t.userId] })],
);

// What the phones sync up (piece 5): each row as its phone wrote it, keyed by its account and its id from the
// phone. `received_at` is when the server first took it. Workouts arrive done, so they have no status.

const synced = { userId: text('user_id').notNull(), id: text('id').notNull() };
const received = { receivedAt: integer('received_at').notNull() };

/** Challenges you made. Ours (owner reprepgo) live in the app; a run of one points at its fixed id. */
export const challenges = sqliteTable(
  'challenges',
  {
    ...synced,
    visibility: text('visibility', { enum: ['private', 'public'] }).notNull(),
    currentVersionId: text('current_version_id').notNull(),
    retiredAt: integer('retired_at'),
    ...received,
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

export const challengeVersions = sqliteTable(
  'challenge_versions',
  {
    ...synced,
    challengeId: text('challenge_id').notNull(),
    number: integer('number').notNull(),
    name: text('name').notNull(),
    days: integer('days').notNull(),
    dailyTotal: integer('daily_total', { mode: 'boolean' }).notNull(),
    restartOnMiss: integer('restart_on_miss', { mode: 'boolean' }).notNull(),
    plan: text('plan', { mode: 'json' }).notNull(),
    createdAt: integer('created_at').notNull(),
    ...received,
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

export const runs = sqliteTable(
  'runs',
  {
    ...synced,
    challengeId: text('challenge_id').notNull(),
    pinnedVersionId: text('pinned_version_id'),
    groupChallengeId: text('group_challenge_id'),
    startedOn: text('started_on').notNull(),
    endedOn: text('ended_on'),
    endReason: text('end_reason', { enum: ['left'] }),
    ...received,
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

export const workouts = sqliteTable(
  'workouts',
  {
    ...synced,
    runId: text('run_id'),
    versionId: text('version_id'),
    day: text('day').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    tzOffsetMin: integer('tz_offset_min').notNull(),
    tz: text('tz').notNull(),
    appVersion: text('app_version').notNull(),
    ...received,
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

export const sets = sqliteTable(
  'sets',
  {
    ...synced,
    workoutId: text('workout_id').notNull(),
    planStep: integer('plan_step').notNull(),
    exercise: text('exercise').notNull(),
    goal: text('goal', { mode: 'json' }).notNull(),
    reps: integer('reps').notNull(),
    noReps: integer('no_reps').notNull(),
    heldMs: integer('held_ms').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at').notNull(),
    counterVersion: text('counter_version').notNull(),
    attempts: text('attempts', { mode: 'json' }).notNull(),
    metrics: text('metrics', { mode: 'json' }),
    ...received,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    // One set per planned step, as on the phone: a resent workout can't count a step twice.
    uniqueIndex('sets_workout_step').on(t.userId, t.workoutId, t.planStep),
    // The hourly week close finds who trained in a week by when their sets ended, across all accounts.
    index('sets_ended').on(t.endedAt),
  ],
);

/** Freezes; the id is `kind:day`, so two phones writing the same freeze write one row. */
export const streakEvents = sqliteTable(
  'streak_events',
  {
    ...synced,
    day: text('day').notNull(),
    kind: text('kind', { enum: ['earned', 'used'] }).notNull(),
    createdAt: integer('created_at').notNull(),
    ...received,
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

/**
 * What a pull reads after its cursor: one row per synced row, moved to the end (a new `seq`) each time the
 * row is written. A workout's row stands for its sets.
 */
export const changes = sqliteTable(
  'changes',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    entity: text('entity', {
      enum: ['challenge', 'challenge_version', 'run', 'workout', 'streak_event'],
    }).notNull(),
    entityId: text('entity_id').notNull(),
  },
  (t) => [
    uniqueIndex('changes_row').on(t.userId, t.entity, t.entityId),
    index('changes_pull').on(t.userId, t.seq),
  ],
);

/**
 * Traces shared to train the counter (piece 6): one row per file in the R2 bucket `TRACES`, at
 * `traces/<user>/<set>.sht`, so every file has one to find it by. `write_id` changes with each upload:
 * a deletion removes only the rows it read, never one an upload stamped after its file landed.
 */
export const traces = sqliteTable(
  'traces',
  {
    userId: text('user_id').notNull(),
    setId: text('set_id').notNull(),
    writeId: text('write_id').notNull(),
    bytes: integer('bytes').notNull(),
    uploadedAt: integer('uploaded_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.setId] })],
);

/**
 * Weekly leagues (piece 7): your place in a week, the Monday (UTC) it starts. `cohort` numbers the boards of
 * about 30 people within a league. `points`, `rank` and `move` are written when the week closes; until
 * then the board counts points live.
 */
export const leagueWeeks = sqliteTable(
  'league_weeks',
  {
    userId: text('user_id').notNull(),
    week: text('week').notNull(),
    league: text('league', { enum: ['bronze', 'silver', 'gold'] }).notNull(),
    cohort: integer('cohort').notNull(),
    points: integer('points'),
    rank: integer('rank'),
    move: text('move', { enum: ['up', 'down', 'stay'] }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.week] }),
    index('league_weeks_board').on(t.week, t.league, t.cohort),
  ],
);

/** Weeks closed: their ranks and moves are final, and a workout synced later doesn't reopen them. */
export const leagueCloses = sqliteTable('league_closes', {
  week: text('week').primaryKey(),
  closedAt: integer('closed_at').notNull(),
});

/** Whether others see your name on the leaderboard. No row: hidden, and not asked yet. */
export const leaderboardChoices = sqliteTable(
  'leaderboard_choices',
  {
    userId: text('user_id').notNull(),
    visible: integer('visible', { mode: 'boolean' }).notNull(),
    chosenAt: integer('chosen_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId] })],
);
