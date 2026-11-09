import type { PoseDetection } from 'superhabit-pose';

import { settle, type Framing } from './framing';
import { repPhrase, startPhrase } from './phrase';
import { done, type FlatSteps } from './plan';
import { statsOf, type Attempt } from './results';
import {
  EXERCISES,
  outOfFrame,
  type Counters,
  type ExerciseId,
  type Pose,
  type Progress,
} from '@/exercises/registry';

/** Per-frame, never in React state. Called for every detector result, in every stage. */
export type Live = {
  /** Current exercise's smoothed measured angle (deg); null when not measured this frame. */
  angle: number | null;
  /** Lowest held angle since the last top (the rep's depth so far); null while phase is 'waiting'. */
  lowest: number | null;
  /** MediaPipe indices [a, vertex, c] of the measured angle (better-seen side); null if none. */
  joints: readonly [number, number, number] | null;
};

/** The part of a session that counting reads and changes: the plan, its counters, framing, this set. */
export type Counting = Counters &
  Framing & {
    steps: FlatSteps;
    step: number;
    /** A detector frame was handled this set; until then nothing is known about framing. */
    framed: boolean;
    attempts: readonly Attempt[];
  };

type Plan = Pick<Counting, 'steps' | 'step'>;

export const current = (c: Plan) => c.steps[c.step];

/** Exercise shown by the runner, including when the current step is a rest. */
export function lastExercise(c: Plan) {
  for (let i = c.step; i >= 0; i -= 1) {
    const step = c.steps[i];
    if (step.exercise !== 'rest') return step;
  }
  return c.steps[0];
}

export const samePlacement = (c: Plan) => {
  const next = c.steps[c.step + 1];
  return (
    next !== undefined &&
    next.exercise !== 'rest' &&
    EXERCISES[next.exercise].placement === EXERCISES[lastExercise(c).exercise].placement
  );
};

/** This set has a rep, a failed one or held time; from then on 'waiting' means lost, not set-up. */
export const started = (c: Plan & Counters) => {
  const { reps, noReps, heldMs }: Progress = c[lastExercise(c).exercise];
  return reps + noReps > 0 || heldMs > 0;
};

/** Steps only `id`'s counter. Generic K keeps EXERCISES[id] and c[id] correlated without assertions. */
function stepCounter<K extends ExerciseId>(c: Counters, id: K, pose: Pose, nowMs: number) {
  const exercise = EXERCISES[id];
  const sample = exercise.measure(pose);
  const next = exercise.step(c[id], sample, nowMs);
  const patch: Partial<Counters> = {};
  patch[id] = next;
  const readout = exercise.live(next);
  const live: Live = {
    angle: sample ? readout.signal : null,
    lowest: readout.lowest,
    joints: sample?.joints ?? null,
  };
  return { next, patch, live };
}

/** Drops only `id`'s attempt in progress, so the next count needs the start position again. */
export function expireCounter<K extends ExerciseId>(c: Counters, id: K) {
  const patch: Partial<Counters> = {};
  patch[id] = EXERCISES[id].reset(c[id]);
  return patch;
}

/**
 * One detector frame through the current counter: what changes (`update`), the per-frame readout, a rep
 * or no-rep to flash, and what the coach says. Each frame steps the counter once, here.
 */
export function countFrame(c: Counting, result: PoseDetection) {
  const t = result.timestampMs;
  const { exercise: id, goal } = lastExercise(c);
  const prev: Progress = c[id];
  const { next, patch, live } = stepCounter(c, id, result, t);
  const update: Partial<Counting> = { ...patch };
  const say: string[] = [];
  let flash: 'rep' | 'noRep' | null = null;

  // shortcut: event lines stay on in release builds for lab sessions (adb logcat -s ReactNativeJS);
  // drop them or gate them with the recorder setting before shipping.
  if (next.phase !== prev.phase)
    console.info('[session]', id, 'phase', prev.phase, '->', next.phase);
  const rep = next.lastRep;
  if (rep && (next.reps > prev.reps || next.noReps > prev.noReps)) {
    const { counted, depth } = rep;
    console.info('[session]', id, counted ? 'rep' : 'no-rep', next.reps, next.noReps);
    console.info('[session]', id, statsOf({ ...c, ...patch }, id));
    if (EXERCISES[id].kind !== 'hold') {
      if (rep.startMs === null || rep.endMs === null)
        throw new Error('Cycle and sequence attempts must have start and end times');
      update.attempts = [
        ...c.attempts,
        {
          startMs: rep.startMs,
          bottomMs: rep.bottomMs,
          endMs: rep.endMs,
          counted,
          depth,
          cue: rep.cues[0] ?? null,
        },
      ];
    }
    flash = counted ? 'rep' : 'noRep';
  }
  // `ending` announces the final rep or MAX hold break; "Go" only before the first attempt.
  const text =
    (!done(goal, next) ? repPhrase(prev, next, rep?.cues) : null) ??
    (started(c) ? null : startPhrase(prev.phase, next.phase));
  if (text) say.push(text);

  const parts = next.phase === 'waiting' ? outOfFrame(result.landmarks, EXERCISES[id].parts) : null;
  const framing = settle(c, parts, t);
  if (framing.patch) Object.assign(update, framing.patch);
  // Framing is known once the first reading is all in frame or has settled; until then the checklist
  // shows every part out, never a false all-clear.
  if (!c.framed && (!parts?.length || framing.patch?.missing !== undefined)) update.framed = true;
  if (framing.patch?.missing)
    console.info('[session]', id, 'out of frame', framing.patch.missing.join(', ') || 'none');
  if (framing.phrase) say.push(framing.phrase);
  // The raw frame explains waiting immediately; the screen's framing checklist settles separately.
  const waiting =
    next.phase !== 'waiting'
      ? null
      : result.landmarks.length === 0
        ? 'no body'
        : parts?.length
          ? `out of frame: ${parts.join(', ')}`
          : 'start position';
  return { update, live, flash, say, phase: next.phase, waiting };
}
