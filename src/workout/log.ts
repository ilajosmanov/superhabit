import { fromCallback } from 'xstate';

import { discardWorkout, logSet, saveWorkout, workoutStart, type LogTarget } from './store';
import type { StepResult } from '@/workout/plan/results';

/** What the session tells its log: a set finished, Done was pressed, or you chose to discard it. */
export type LogEvent = { type: 'set'; set: StepResult } | { type: 'done' } | { type: 'discard' };
/** The session's workout: its id, what it counts toward, and when the session started. */
export type LogInput = { workoutId: string; target: LogTarget; start: Date };

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
