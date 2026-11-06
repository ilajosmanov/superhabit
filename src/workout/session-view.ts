import type { SnapshotFrom } from 'xstate';

import type { Exercise, Measured } from '@/exercises/exercise';
import { EXERCISES, type Progress } from '@/exercises/registry';

import { NONE } from './framing';
import { current, lastExercise, samePlacement, started, type workoutSession } from './session';

const STAGES = ['switching', 'finished', 'resting', 'countdown', 'paused'] as const;

/** What the screen renders. Hides the keyed counters and per-exercise report types. */
export type SessionView = ReturnType<typeof sessionView>;

/** Selector for useSelector(..., shallowEqual). Pure. */
export function sessionView(snapshot: SnapshotFrom<typeof workoutSession>) {
  const c = snapshot.context;
  const { exercise: id, goal } = lastExercise(c);
  const tally: Progress = c[id];
  const unit: 'reps' | 'seconds' = EXERCISES[id].kind === 'hold' ? 'seconds' : 'reps';
  const after = c.steps.slice(c.step + 1).find((step) => step.exercise !== 'rest');
  const stage = STAGES.find((s) => snapshot.matches(s)) ?? 'counting';
  const rest = current(c).goal;
  // Annotated to hide the per-exercise counter types: what the between-sets prompt shows.
  const next: Pick<Exercise<Progress, Measured>, 'name' | 'place' | 'steps' | 'hint'> | null = after
    ? EXERCISES[after.exercise]
    : null;
  return {
    stage,
    /** The current set's exercise; in switching and finished, the set just done. */
    exercise: id,
    name: EXERCISES[id].name,
    /** Infinity = open-ended. */
    target: goal.type === 'reps' ? goal.n : Infinity,
    unit,
    heldS: Math.floor(tally.heldMs / 1000),
    goalS: goal.type === 'seconds' ? goal.n : Infinity,
    countdown: stage === 'countdown' ? c.countdown : null,
    /** Seconds left of a timed rest; null outside one, and for an open-ended rest. */
    restLeftS:
      stage === 'resting' && rest.type === 'seconds' ? Math.max(0, rest.n - c.stepS) : null,
    samePlacement: samePlacement(c),
    reps: tally.reps,
    phase: tally.phase,
    started: started(c),
    /** Finished through the last step rather than `end`, met goals or not. */
    reachedEnd: c.reachedEnd,
    /** 1-based. */
    set: c.steps.slice(0, c.step + 1).filter((step) => step.exercise !== 'rest').length,
    sets: c.steps.filter((step) => step.exercise !== 'rest').length,
    /** The set after this one (stable references, for shallowEqual). */
    next,
    nextGoal: after?.goal ?? null,
    /** Whole seconds; ticks while counting, switching or resting. */
    elapsedS: c.elapsedS,
    muted: c.muted,
    skeleton: c.skeleton,
    camera: c.camera,
    /** The camera has a video output to film with; false for the rest of the session once it drops it. */
    filming: c.video !== undefined && !c.videoLost,
    /** The last phrase the coach said (set even when muted); cleared ~3 s later. */
    caption: c.caption,
    /** Body parts out of frame while phase is 'waiting', ~1 s stable; [] when all in or not waiting. */
    // Ending a set while still waiting would otherwise carry its parts into switching.
    missing: stage !== 'counting' ? NONE : c.framed ? c.missing : EXERCISES[id].parts,
    /** This set's latest rep call (a stable reference); null before the first. */
    call: c.attempts.at(-1) ?? null,
    /** 'rep' for ~600 ms after a counted rep, 'noRep' for ~1000 ms after a no-rep. */
    flash: c.flash,
    /** This set, in order. */
    attempts: c.attempts,
    /** Current exercise's thresholds, deg. */
    gauge: EXERCISES[id].gauge,
    /** Finished sets; on 'finished' includes the last (possibly partial) set. */
    results: c.results,
    /** Finished and every file final, so results (and their clips) are safe to keep. */
    final: c.final,
    /** A take is being filmed (the REC dot). */
    recording: c.take !== null,
    /** The deepest filmed counted rep of the challenge, once finished and its file is ready; null if none. */
    best: c.best,
  };
}
