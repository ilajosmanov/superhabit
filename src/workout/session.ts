import * as ScreenOrientation from 'expo-screen-orientation';
import { createPoseLandmarker, type PoseDetection, type PoseLandmarker } from 'superhabit-pose';
import { assign, enqueueActions, fromCallback, sendTo, setup, type SnapshotFrom } from 'xstate';

import { repPhrase, setPhrase } from '@/feedback/phrase';
import { speech } from '@/feedback/speech';

import {
  EXERCISES,
  initialCounters,
  type Counters,
  type Exercise,
  type ExerciseId,
  type Pose,
  type Tally,
} from '@/exercises/registry';

import type { Challenge } from './challenges';

type Events =
  | { type: 'ready'; landmarker: PoseLandmarker }
  | { type: 'pose'; result: PoseDetection }
  | { type: 'reset' } // counting: zero the current set
  | { type: 'next' }; // counting: end the set now; switching: the phone is in place, start the next set

type OnPose = (result: PoseDetection) => void;
type Input = { challenge: Challenge; onPose?: OnPose };
type Orientation = Exercise<Tally>['orientation'];

/** One counter per exercise at the top level. `set` indexes `challenge.sets`; during switching it is still the finished set. */
type Context = Counters & {
  landmarker: PoseLandmarker | null;
  onPose?: OnPose;
  challenge: Challenge;
  set: number;
};

/** Owns the native detector for as long as the session runs; native pushes each result to JS. */
const landmarker = fromCallback<Events>(({ sendBack }) => {
  const instance = createPoseLandmarker();
  instance.onResult = (result) => sendBack({ type: 'pose', result });
  sendBack({ type: 'ready', landmarker: instance });
  return () => instance.close();
});

type LockEvent = { type: 'lock'; orientation: Orientation };

/** Locks the UI to the input orientation, re-locks on each `lock`, and restores portrait (the app's) on stop. */
const orientation = fromCallback<LockEvent, Orientation>(({ input, receive }) => {
  const { lockAsync, OrientationLock } = ScreenOrientation;
  // LANDSCAPE, not one side: the phone may lie on either long edge.
  const lock = (o: Orientation) =>
    void lockAsync(o === 'landscape' ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP);
  lock(input);
  receive((event) => lock(event.orientation));
  return () => lock('portrait');
});

type Actors = {
  landmarker: typeof landmarker;
  speech: typeof speech;
  orientation: typeof orientation;
};

const current = (c: Context) => c.challenge.sets[c.set];
const orientationOf = (c: Context) => EXERCISES[current(c).exercise].orientation;
const isLast = (c: Context) => c.set === c.challenge.sets.length - 1;

/** Steps only `id`'s counter. Generic K keeps EXERCISES[id] and c[id] correlated without assertions. */
function stepCounter<K extends ExerciseId>(c: Counters, id: K, pose: Pose, nowMs: number) {
  const next = EXERCISES[id].step(c[id], pose, nowMs);
  const patch: Partial<Counters> = {};
  patch[id] = next;
  return { next, patch };
}

const statsOf = <K extends ExerciseId>(c: Counters, id: K) => EXERCISES[id].stats(c[id]);

/**
 * One challenge run. Detector, speech and orientation lock live for the whole run (root invokes),
 * so the model loads once and the dots keep drawing while the phone is moved.
 *
 *   counting --(target reached | next)--> ending --(last set)--> finished
 *                                               \--> switching --next--> counting (set + 1)
 *
 * Only `counting` steps a counter; switching and finished only hand frames to the screen.
 * finished is not `type: 'final'`: a final root state would stop speech and cut "Challenge done".
 */
// Positional generics up to TInput (no type assertions allowed): children, actions, guards, delays, tags.
export const workoutSession = setup<Context, Events, Actors, {}, {}, {}, never, string, Input>({
  actors: { landmarker, speech, orientation },
}).createMachine({
  context: ({ input }) => ({
    ...initialCounters,
    landmarker: null,
    onPose: input.onPose,
    challenge: input.challenge,
    set: 0,
  }),
  invoke: [
    { src: 'landmarker' },
    { src: 'speech', id: 'speech' },
    { src: 'orientation', id: 'orientation', input: ({ context }) => orientationOf(context) },
  ],
  on: {
    ready: { actions: assign({ landmarker: ({ event }) => event.landmarker }) },
    pose: { actions: ({ context, event }) => context.onPose?.(event.result) },
  },
  initial: 'counting',
  states: {
    counting: {
      on: {
        pose: {
          // Each result steps the current counter once, here; context is the only record of the count.
          actions: enqueueActions(({ context, event, enqueue }) => {
            context.onPose?.(event.result);
            const { exercise: id, reps: target } = current(context);
            const prev: Tally = context[id];
            const { next, patch } = stepCounter(
              context,
              id,
              event.result,
              event.result.timestampMs,
            );
            enqueue.assign(patch);
            // The set's last rep is announced by `ending` instead.
            const text = next.reps < target && repPhrase(prev, next, next.lastRep?.cues);
            if (text) enqueue(sendTo('speech', { type: 'say', text }));
          }),
        },
        reset: { actions: assign(initialCounters) },
        next: 'ending',
      },
      always: {
        guard: ({ context }) => context[current(context).exercise].reps >= current(context).reps,
        target: 'ending',
      },
    },
    ending: {
      entry: sendTo('speech', ({ context }) => {
        const { reps } = context[current(context).exercise];
        const next = context.challenge.sets[context.set + 1];
        const text = setPhrase(
          reps,
          next ? { ...EXERCISES[next.exercise], reps: next.reps } : null,
        );
        return { type: 'say', text };
      }),
      always: [
        { guard: ({ context }) => isLast(context), target: 'finished' },
        { target: 'switching' },
      ],
    },
    switching: {
      on: {
        next: {
          target: 'counting',
          // Rotate only now: the between-sets prompt stays in the finished set's orientation.
          actions: [
            // shortcut: advancing discards completed set results; capture them separately from live
            // counters before adding a challenge summary, workout history or progress tracking.
            assign(({ context }) => ({ ...initialCounters, set: context.set + 1 })),
            sendTo('orientation', ({ context }) => ({
              type: 'lock',
              orientation: orientationOf(context),
            })),
          ],
        },
      },
    },
    finished: {},
  },
});

/** What the screen renders. Hides the keyed counters and per-exercise report types. */
export type SessionView = {
  stage: 'counting' | 'switching' | 'finished';
  /** The current set; in switching and finished, the set just done. */
  name: string;
  /** Infinity = open-ended. */
  target: number;
  reps: number;
  noReps: number;
  phase: Tally['phase'];
  /** Metrics and cues of the last rep, or null before the first rep. */
  stats: string | null;
  /** 1-based. */
  set: number;
  sets: number;
  /** The set after this one (stable references, for shallowEqual). */
  next: Omit<Exercise<Tally>, 'initial' | 'step' | 'stats'> | null;
  nextReps: number;
};

/** Selector for useSelector(..., shallowEqual). Pure. */
export function sessionView(snapshot: SnapshotFrom<typeof workoutSession>): SessionView {
  const c = snapshot.context;
  const { exercise: id, reps: target } = current(c);
  const tally: Tally = c[id];
  const metrics = statsOf(c, id);
  const cues = tally.lastRep?.cues ?? [];
  const next = c.challenge.sets[c.set + 1];
  return {
    stage: snapshot.matches('switching')
      ? 'switching'
      : snapshot.matches('finished')
        ? 'finished'
        : 'counting',
    name: EXERCISES[id].name,
    target,
    reps: tally.reps,
    noReps: tally.noReps,
    phase: tally.phase,
    stats: metrics && (cues.length ? `${metrics} · ${cues.join(', ')}` : metrics),
    set: c.set + 1,
    sets: c.challenge.sets.length,
    next: next ? EXERCISES[next.exercise] : null,
    nextReps: next ? next.reps : 0,
  };
}
