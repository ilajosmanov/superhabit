import { z } from 'zod';

// The phone's outbox rows (`src/storage/outbox.ts`), as it sends them: `{ entity, entityId, op, payload }`.
// Fields the server doesn't know are dropped, so a newer phone's additions don't refuse its changes.

const id = z.string().min(1).max(64);
// A real calendar date (`2026-02-30` is refused): the leagues count streaks from it.
const day = z.iso.date();
const instant = z.int().nonnegative();
const count = z.int().nonnegative();
const label = z.string().max(100);
// JSON kept as the phone wrote it; the columns for these can't hold null.
const filled = z.json().refine((value) => value !== null, 'must not be null');

const version = z.object({
  id,
  challengeId: id,
  number: z.int().positive(),
  name: z.string().max(200),
  days: z.int().positive(),
  dailyTotal: z.boolean(),
  restartOnMiss: z.boolean(),
  plan: filled,
  createdAt: instant,
});

const run = z.object({
  id,
  challengeId: id,
  pinnedVersionId: id.nullable(),
  groupChallengeId: id.nullable(),
  startedOn: day,
  endedOn: day.nullable(),
  endReason: z.literal('left').nullable(),
});

const set = z.object({
  id,
  workoutId: id,
  planStep: count,
  exercise: label,
  goal: filled,
  reps: count,
  noReps: count,
  heldMs: count,
  // Not checked against each other: a phone's clock can move back during a workout.
  startedAt: instant,
  endedAt: instant,
  counterVersion: label,
  attempts: filled,
  metrics: z.json().nullable(),
});

const workout = z.object({
  id,
  runId: id.nullable(),
  versionId: id.nullable(),
  day,
  startedAt: instant,
  endedAt: instant.nullable(),
  tzOffsetMin: z.int().min(-840).max(840),
  tz: label,
  appVersion: label,
  sets: z.array(set).max(200),
});

const streakEvent = z.object({
  id,
  day,
  kind: z.enum(['earned', 'used']),
  createdAt: instant,
});

/** One outbox row; each op belongs to one entity. */
const anyChange = z.discriminatedUnion('op', [
  z.object({
    entity: z.literal('challenge'),
    op: z.literal('create'),
    entityId: id,
    payload: z.object({
      id,
      visibility: z.enum(['private', 'public']),
      currentVersionId: id,
      version,
    }),
  }),
  z.object({
    entity: z.literal('challenge'),
    op: z.literal('edit'),
    entityId: id,
    payload: z.object({ version }),
  }),
  z.object({ entity: z.literal('run'), op: z.literal('join'), entityId: id, payload: run }),
  z.object({
    entity: z.literal('run'),
    op: z.literal('leave'),
    entityId: id,
    payload: z.object({ endedOn: day, endReason: z.literal('left') }),
  }),
  z.object({
    entity: z.literal('workout'),
    op: z.literal('done'),
    entityId: id,
    payload: z.object({ workout }),
  }),
  z.object({
    entity: z.literal('streak_event'),
    op: z.literal('add'),
    entityId: id,
    payload: z.object({ event: streakEvent }),
  }),
]);
export const change = anyChange.refine(matches, 'the ids in the payload must match entityId');
export type Change = z.infer<typeof anyChange>;

/** The row a change names is the one its payload holds. */
function matches(c: Change) {
  switch (c.op) {
    case 'create':
      return (
        c.payload.id === c.entityId &&
        c.payload.version.challengeId === c.entityId &&
        c.payload.version.id === c.payload.currentVersionId
      );
    case 'edit':
      return c.payload.version.challengeId === c.entityId;
    case 'join':
      return c.payload.id === c.entityId;
    case 'leave':
      return true;
    case 'done':
      return (
        c.payload.workout.id === c.entityId &&
        c.payload.workout.sets.every((s) => s.workoutId === c.entityId)
      );
    case 'add':
      return c.payload.event.id === c.entityId;
  }
}
