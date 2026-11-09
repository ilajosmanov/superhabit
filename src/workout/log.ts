import { and, eq } from 'drizzle-orm';
import Constants from 'expo-constants';
import { fromCallback } from 'xstate';

import { deleteTraces } from './recorder-file';
import { today } from './day';
import type { StepResult } from './results';
import { db } from '@/storage/database';
import { enqueue } from '@/storage/outbox';
import { sets, workouts } from '@/storage/schema';

/** What the session tells its log: a set finished, Done was pressed, or you chose to discard it. */
export type LogEvent = { type: 'set'; set: StepResult } | { type: 'done' } | { type: 'discard' };
/** The run and version a workout counts toward; both null for a free log (one go at an exercise). */
export type LogTarget = { runId: string | null; versionId: string | null };
/** The session's workout: its id, what it counts toward, and when the session started. */
export type LogInput = { workoutId: string; target: LogTarget; start: Date };

/** A workout as it opens: where and when it started, never recomputed. */
export function workoutStart(id: string, target: LogTarget, now = new Date()) {
  return {
    id,
    ...target,
    day: today(now),
    startedAt: now.getTime(),
    tzOffsetMin: -now.getTimezoneOffset(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
  };
}

/** Writes a finished set, opening its workout with the first one. */
export function logSet(workout: ReturnType<typeof workoutStart>, set: StepResult) {
  db().transaction((tx) => {
    tx.insert(workouts)
      .values({ ...workout, status: 'open' })
      .onConflictDoNothing({ target: workouts.id })
      .run();
    tx.insert(sets)
      .values({
        id: set.id,
        workoutId: set.workoutId,
        planStep: set.planStep,
        exercise: set.exercise,
        goal: set.goal,
        reps: set.reps,
        noReps: set.noReps,
        heldMs: set.heldMs,
        startedAt: set.startedAt,
        endedAt: set.endedAt,
        counterVersion: set.counterVersion,
        attempts: set.attempts,
        // shortcut: the set's stats are a display string for now; store their numbers when history needs them.
        metrics: null,
      })
      .run();
  });
}

/**
 * Done: the open workout is kept, ended at `endedAt`, and queued for the server with its sets. A second
 * Done changes nothing.
 */
export function saveWorkout(workoutId: string, endedAt = Date.now()) {
  db().transaction((tx) => {
    const saved = tx
      .update(workouts)
      .set({ status: 'done', endedAt })
      .where(and(eq(workouts.id, workoutId), eq(workouts.status, 'open')))
      .returning()
      .all();
    if (saved.length === 0) return;
    const workout = tx.query.workouts
      .findFirst({ where: { id: workoutId }, with: { sets: true } })
      .sync();
    enqueue(tx, { entity: 'workout', entityId: workoutId, op: 'done', data: { workout } });
  });
}

/** Throws an open workout away with its sets; a saved one is never touched. */
export function discardWorkout(workoutId: string, unwritten: readonly StepResult[] = []) {
  const workout = db().select().from(workouts).where(eq(workouts.id, workoutId)).get();
  if (workout?.status === 'done') return;
  const rows = db().select({ id: sets.id }).from(sets).where(eq(sets.workoutId, workoutId)).all();
  db()
    .delete(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.status, 'open')))
    .run();
  // After the rows: a workout still offered for Save must keep its traces.
  try {
    deleteTraces([...rows, ...unwritten].map((set) => set.id));
  } catch (error) {
    console.warn('[log] could not delete discarded traces', error);
  }
}

/**
 * One session's writes, for as long as the session runs: each finished set, then Done or Discard. A set
 * that fails to write is kept and written again before the next write; Done saves only once every set
 * is in and answers `logSaved` or `logFailed`, Discard answers `logDiscarded` or `logFailed`. A failed set write is sent back as `logFailed` too. Stopping without Done (nothing was
 * counted) discards the workout; after a failed Done it stays open, and the next start offers it again.
 */
export const workoutLog = fromCallback<LogEvent, LogInput>(
  ({ input: { workoutId, target, start }, receive, sendBack }) => {
    const workout = workoutStart(workoutId, target, start);
    let unwritten: StepResult[] = [];
    let doneAsked = false;
    let discarded = false;
    const write = (change: () => void) => {
      try {
        change();
        return true;
      } catch (error) {
        console.warn('[log] write failed', error);
        return false;
      }
    };
    /** Writes every set not yet in, in order; true when none is left. */
    const writeSets = () => {
      unwritten = unwritten.filter((set) => !write(() => logSet(workout, set)));
      return unwritten.length === 0;
    };
    receive((event) => {
      if (event.type === 'discard') {
        discarded = write(() => discardWorkout(workoutId, unwritten));
        if (discarded) unwritten = [];
        sendBack({ type: discarded ? 'logDiscarded' : 'logFailed' });
        return;
      }
      if (event.type === 'set') {
        unwritten = [...unwritten, event.set];
        if (!writeSets()) sendBack({ type: 'logFailed' });
        return;
      }
      doneAsked = true;
      const saved = writeSets() && write(() => saveWorkout(workoutId));
      sendBack({ type: saved ? 'logSaved' : 'logFailed' });
    });
    return () => {
      if (!doneAsked && !discarded) write(() => discardWorkout(workoutId, unwritten));
    };
  },
);
