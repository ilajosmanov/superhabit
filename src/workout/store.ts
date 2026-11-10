import { and, eq } from 'drizzle-orm';
import Constants from 'expo-constants';

import { db } from '@/storage/database';
import { enqueue } from '@/storage/outbox';
import { sets, workouts } from '@/storage/schema';
import { deleteTraces, deleteVideos, listVideos, removeVideo } from '@/storage/set-files';
import { discardTraceWrites } from '@/workout/capture/recorder-file';
import { discardVideoWrites } from '@/workout/capture/camcorder';
import { today } from '@/workout/plan/day';
import type { StepResult } from '@/workout/plan/results';

/** The run and version a workout counts toward; both null for a free log (one go at an exercise). */
export type LogTarget = { runId: string | null; versionId: string | null };

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
  // After the rows: a workout still offered for Save must keep its recordings.
  const ids = [...rows, ...unwritten].map((set) => set.id);
  try {
    // Cancel and delete each set in order, stopping both if a delete throws.
    for (const id of ids) {
      discardTraceWrites([id]);
      deleteTraces([id]);
    }
  } catch (error) {
    console.warn('[log] could not delete discarded traces', error);
  }
  try {
    discardVideoWrites(ids);
    deleteVideos(ids);
  } catch (error) {
    console.warn('[log] could not delete discarded videos', error);
  }
}

/** The open workout: at most one is open at a time. */
export const openWorkout = () =>
  db().query.workouts.findFirst({ where: { status: 'open' }, columns: { id: true } });

/** The workout a session left open (the app closed before Done), or null. */
export const findOpenWorkout = () => openWorkout().sync() ?? null;

/**
 * Saves a workout left open, ended when its last set ended (not now: the app was closed since). The last
 * set is the furthest in the plan, not the latest clock time: the phone's clock can go back mid-workout.
 */
export function saveOpenWorkout(id: string) {
  const workout = db()
    .query.workouts.findFirst({
      where: { id },
      with: { sets: { columns: { endedAt: true }, orderBy: { planStep: 'desc' }, limit: 1 } },
    })
    .sync();
  if (!workout) return;
  saveWorkout(id, workout.sets[0]?.endedAt ?? workout.startedAt);
}

/** Whole tables for live readers; each subscription follows its own table's changes. */
export const workoutRows = () => db().query.workouts.findMany();
export const setRows = () => db().query.sets.findMany();

/** At startup only, before any session runs; open workouts' sets must keep their videos for Save. */
export function deleteOrphanVideos() {
  const ids = new Set(
    db()
      .select({ id: sets.id })
      .from(sets)
      .all()
      .map((row) => row.id),
  );
  for (const { setId, file } of listVideos()) if (!ids.has(setId)) removeVideo(file);
}
