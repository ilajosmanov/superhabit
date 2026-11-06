import * as ScreenOrientation from 'expo-screen-orientation';
import { createPoseLandmarker, type PoseDetection, type PoseLandmarker } from 'superhabit-pose';
import {
  assign,
  enqueueActions,
  fromCallback,
  raise,
  sendTo,
  setup,
  type SnapshotFrom,
} from 'xstate';

import { framePhrase, repPhrase, setPhrase, startPhrase } from './phrase';
import { speech } from './speech';
import { recorder, type RecorderEvent } from './recorder';

import type { Exercise, Measured, Orientation } from '@/exercises/exercise';
import {
  EXERCISES,
  initialCounters,
  outOfFrame,
  orientation,
  type BodyPart,
  type Counters,
  type ExerciseId,
  type Pose,
  type Progress,
} from '@/exercises/registry';

import { bestRep, clipTime, type Attempt, type BestRep, type StepResult } from './results';
import { camcorder, type VideoOutput } from './camcorder';
import { done, expand, type Challenge, type FlatSteps, type Goal } from './plan';

/** Per-frame, never in React state. Called for every detector result, in every stage. */
export type Live = {
  /** Current exercise's smoothed measured angle (deg); null when not measured this frame. */
  angle: number | null;
  /** Lowest held angle since the last top (the rep's depth so far); null while phase is 'waiting'. */
  lowest: number | null;
  /** MediaPipe indices [a, vertex, c] of the measured angle (better-seen side); null if none. */
  joints: readonly [number, number, number] | null;
};

type Events =
  | { type: 'ready'; landmarker: PoseLandmarker }
  | { type: 'pose'; result: PoseDetection }
  | { type: 'next' } // counting: end the set; resting: skip rest; switching: the phone is in place
  | { type: 'pause' } // counting or countdown
  | { type: 'resume' } // paused
  | { type: 'restart' } // paused: zero the current set and count again
  | { type: 'end' } // any stage but finished: finish now, keeping results so far
  | { type: 'toggleVoice' }
  | { type: 'toggleSkeleton' }
  // counting before the set's first attempt: switch camera; paused: restart the set on the other camera.
  | { type: 'flipCamera' }
  | { type: 'cameraReady' } // the camera's preview streams again (after a flip)
  | { type: 'videoLost' } // the camera dropped the video output: nothing more can be filmed
  // Internal.
  | { type: 'tick' }
  | { type: 'say'; text: string }
  | { type: 'rolling'; uri: string } // the camcorder's take really started
  | { type: 'taken'; uri: string; ok: boolean } // a take's file is final; not ok: unusable
  | { type: 'wrapped' } // the camcorder finished every file and deleted all but the best
  | { type: 'flashOff' }
  | { type: 'captionOff' };

type OnPose = (result: PoseDetection, live: Live) => void;
/** `video`: the camera's video output (also passed to PoseCamera); without it nothing is filmed. */
type Input = { challenge: Challenge; onPose?: OnPose; video?: VideoOutput; record?: boolean };

/** One counter per exercise. `step` indexes expanded steps; switching still points to the finished step. */
type Context = Counters & {
  landmarker: PoseLandmarker | null;
  onPose?: OnPose;
  video?: VideoOutput;
  record: boolean;
  steps: FlatSteps;
  step: number;
  // shortcut: every run is day 1 until joined challenges persist.
  day: number;
  stepS: number;
  stepStartedAt: number | null;
  countdown: number;
  completed: boolean;
  elapsedS: number;
  muted: boolean;
  /** Draw the skeleton over the camera; detection runs either way. */
  skeleton: boolean;
  // shortcut: not persisted, every run starts on the front camera; store it if people keep flipping.
  camera: 'front' | 'back';
  /** A flip is waiting for the new camera to stream; survives a pause, so resuming can't count old frames. */
  flipPending: boolean;
  caption: string | null;
  /** Committed out-of-frame parts; `candidate` is a differing reading until it has held STABLE_MS. */
  missing: readonly BodyPart[];
  candidate: { parts: readonly BodyPart[]; since: number } | null;
  flash: 'rep' | 'noRep' | null;
  attempts: readonly Attempt[];
  results: readonly StepResult[];
  /** The file being filmed; `startMs` is the first detector frame after it started, null until then. */
  take: { uri: string; startMs: number | null } | null;
  /** Set once the camcorder wrapped up the finished session's files. */
  best: BestRep | null;
};

const STABLE_MS = 1000;
const CAPTION_MS = 3000;
const REP_FLASH_MS = 600;
const NO_REP_FLASH_MS = 1000;
const NONE: readonly BodyPart[] = [];
const NOT_LIVE: Live = { angle: null, lowest: null, joints: null };

/** What a new or restarted set starts from. */
const FRESH_SET = {
  ...initialCounters,
  attempts: [],
  missing: NONE,
  candidate: null,
  stepStartedAt: null,
} satisfies Partial<Context>;

/** Owns the native detector for as long as the session runs; native pushes each result to JS. */
const landmarker = fromCallback<Events>(({ sendBack }) => {
  const instance = createPoseLandmarker();
  instance.onResult = (result) => sendBack({ type: 'pose', result });
  sendBack({ type: 'ready', landmarker: instance });
  return () => instance.close();
});

/** Ticks once a second for as long as it is invoked, so elapsed time only runs in those states. */
const ticker = fromCallback(({ sendBack }) => {
  const id = setInterval(() => sendBack({ type: 'tick' }), 1000);
  return () => clearInterval(id);
});

type LockEvent = { type: 'lock'; orientation: Orientation };

/** Locks the UI to the input orientation, re-locks on each `lock`, and restores portrait (the app's) on stop. */
const orientationLock = fromCallback<LockEvent, Orientation>(({ input, receive }) => {
  const { lockAsync, OrientationLock } = ScreenOrientation;
  // LANDSCAPE, not one side: the phone may lie on either long edge.
  const lock = (o: Orientation) =>
    void lockAsync(
      o === 'landscape' ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP,
    ).catch((error) => console.warn('[orientation] could not lock', error));
  lock(input);
  receive((event) => lock(event.orientation));
  return () => lock('portrait');
});

type Actors = {
  landmarker: typeof landmarker;
  speech: typeof speech;
  orientation: typeof orientationLock;
  ticker: typeof ticker;
  camcorder: typeof camcorder;
  recorder: typeof recorder;
};

const current = (c: Context) => c.steps[c.step];
const isLast = (c: Context) => c.step === c.steps.length - 1;

/** Exercise shown by the runner, including when the current step is a rest. */
function lastExercise(c: Context) {
  for (let i = c.step; i >= 0; i -= 1) {
    const step = c.steps[i];
    if (step.exercise !== 'rest') return step;
  }
  return c.steps[0];
}

const samePlacement = (c: Context) => {
  const next = c.steps[c.step + 1];
  return (
    next !== undefined &&
    next.exercise !== 'rest' &&
    EXERCISES[next.exercise].placement === EXERCISES[lastExercise(c).exercise].placement
  );
};

/** Rest display objects stay stable across detector frames for the shallowEqual selector. */
const restViews = new WeakMap<Context, { leftS: number | null }>();
function restView(c: Context) {
  const cached = restViews.get(c);
  if (cached) return cached;
  const goal = current(c).goal;
  const view = { leftS: goal.type === 'seconds' ? Math.max(0, goal.n - c.stepS) : null };
  restViews.set(c, view);
  return view;
}

const repTarget = (goal: Goal) => (goal.type === 'reps' ? goal.n : Infinity);
const flip = (c: Context) => (c.camera === 'front' ? 'back' : 'front');

function saveTrace(c: Context): RecorderEvent {
  const { exercise } = lastExercise(c);
  const { reps, heldMs } = c[exercise];
  return {
    type: 'save',
    exercise,
    labels: EXERCISES[exercise].kind === 'hold' ? { holdMs: heldMs } : { reps },
  };
}

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
function expireCounter<K extends ExerciseId>(c: Counters, id: K) {
  const patch: Partial<Counters> = {};
  patch[id] = EXERCISES[id].reset(c[id]);
  return patch;
}

const unclip = (attempts: readonly Attempt[], uri: string) =>
  attempts.map((a) => (a.clip?.uri === uri ? { ...a, clip: undefined } : a));

/** Metrics and cues of the last rep, or null before the first rep. */
function statsOf<K extends ExerciseId>(c: Counters, id: K) {
  const metrics = EXERCISES[id].stats(c[id]);
  const cues = c[id].lastRep?.cues ?? [];
  return metrics && (cues.length ? `${metrics} · ${cues.join(', ')}` : metrics);
}

/** The results with the current set (finished or cut short) appended. */
function withSet(c: Context): readonly StepResult[] {
  const { exercise: id, goal, round } = lastExercise(c);
  const { reps, noReps, heldMs }: Progress = c[id];
  const { name, gauge } = EXERCISES[id];
  const set = {
    exercise: id,
    day: c.day,
    round,
    startedAt: c.stepStartedAt ?? Date.now(),
    endedAt: Date.now(),
    name,
    gauge,
    goal,
    reps,
    noReps,
    heldMs,
    attempts: c.attempts,
  };
  return [...c.results, { ...set, stats: statsOf(c, id) }];
}

const same = (a: readonly BodyPart[], b: readonly BodyPart[]) =>
  a.length === b.length && a.every((part, i) => part === b[i]);

type Framing = Pick<Context, 'missing' | 'candidate'>;

/**
 * Debounces one frame's out-of-frame reading `parts` (null when not waiting: they only explain 'waiting')
 * into `missing`: on frame time `t`, so it doesn't flicker, a differing reading commits once it has held
 * STABLE_MS. `patch` is null when nothing changes, so `missing` keeps its reference; `phrase` is what to say.
 */
function settle(
  { missing, candidate }: Framing,
  parts: readonly BodyPart[] | null,
  t: number,
): { patch: Partial<Framing> | null; phrase: string | null } {
  if (same(parts ?? NONE, missing))
    return { patch: candidate ? { candidate: null } : null, phrase: null };
  if (!parts) return { patch: { missing: NONE, candidate: null }, phrase: null };
  if (!candidate || !same(parts, candidate.parts))
    return { patch: { candidate: { parts, since: t } }, phrase: null };
  if (t - candidate.since < STABLE_MS) return { patch: null, phrase: null };
  return {
    patch: { missing: candidate.parts, candidate: null },
    phrase: framePhrase(candidate.parts),
  };
}

/**
 * One challenge run. Detector, speech and orientation lock live for the whole run (root invokes),
 * so the model loads once and the dots keep drawing while the phone is moved.
 *
 *   counting --(target reached | next)--> ending --> finished | resting | countdown | switching
 *      ^ |                                          resting --(timeout | next)--> countdown | switching
 *      | |                                          countdown --(3 seconds)--> counting
 *      | |                                          switching --next--> counting (step + 1)
 *      | pause
 *   paused --resume | restart | flipCamera--> counting;  end: counting | paused | switching --> finished
 *
 * Only `counting` steps a counter; every other stage only hands frames to the screen.
 * Everything said goes through `say`, so the caption is set even when muted.
 * finished is not `type: 'final'`: a final root state would stop speech and cut "Challenge done".
 */
// Positional generics up to TInput (no type assertions allowed): children, actions, guards, delays, tags.
const session = setup<
  Context,
  Events,
  Actors,
  {},
  { nextStep: undefined },
  { isLast: undefined; nextIsRest: undefined; samePlacement: undefined; restIsTimed: undefined },
  'rest',
  string,
  Input
>({
  actors: { landmarker, speech, orientation: orientationLock, ticker, camcorder, recorder },
  actions: {
    nextStep: assign(({ context }) => ({
      // During a rest the view still shows the exercise just finished.
      ...(context.steps[context.step + 1]?.exercise === 'rest' ? {} : FRESH_SET),
      step: context.step + 1,
      stepS: 0,
    })),
  },
  guards: {
    isLast: ({ context }) => isLast(context),
    nextIsRest: ({ context }) => context.steps[context.step + 1]?.exercise === 'rest',
    samePlacement: ({ context }) => samePlacement(context),
    restIsTimed: ({ context }) => current(context).goal.type === 'seconds',
  },
  delays: {
    rest: ({ context }) => {
      const goal = current(context).goal;
      // A max rest's zero-delay transition is guarded out; never schedule Infinity.
      return goal.type === 'seconds' ? goal.n * 1000 : 0;
    },
  },
});

const ADVANCE = [
  { guard: 'isLast', target: 'finished', actions: session.assign({ completed: true }) },
  { guard: 'nextIsRest', target: 'resting', actions: 'nextStep' },
  {
    guard: 'samePlacement',
    target: 'countdown',
    actions: ['nextStep', session.assign({ countdown: 3 })],
  },
  { target: 'switching' },
] satisfies Parameters<typeof session.createStateConfig>[0]['always'];

export const workoutSession = session.createMachine({
  context: ({ input }) => ({
    ...FRESH_SET,
    landmarker: null,
    onPose: input.onPose,
    video: input.video,
    record: input.record ?? false,
    steps: expand(input.challenge.session),
    step: 0,
    day: 1,
    stepS: 0,
    countdown: 3,
    completed: false,
    elapsedS: 0,
    muted: false,
    skeleton: true,
    camera: 'front',
    flipPending: false,
    caption: null,
    flash: null,
    results: [],
    take: null,
    best: null,
  }),
  invoke: [
    { src: 'landmarker' },
    { src: 'speech', id: 'speech' },
    {
      src: 'orientation',
      id: 'orientation',
      input: ({ context }) => orientation(EXERCISES[lastExercise(context).exercise].placement),
    },
    { src: 'camcorder', id: 'camcorder', input: ({ context }) => context.video },
    { src: 'recorder', id: 'recorder', input: ({ context }) => context.record },
  ],
  on: {
    ready: { actions: assign({ landmarker: ({ event }) => event.landmarker }) },
    pose: { actions: ({ context, event }) => context.onPose?.(event.result, NOT_LIVE) },
    tick: {
      actions: assign({
        elapsedS: ({ context }) => context.elapsedS + 1,
        stepS: ({ context }) => context.stepS + 1,
      }),
    },
    toggleVoice: { actions: assign({ muted: ({ context }) => !context.muted }) },
    toggleSkeleton: { actions: assign({ skeleton: ({ context }) => !context.skeleton }) },
    say: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        enqueue.assign({ caption: event.text });
        // A delayed raise with a reused id does not replace the old timer; cancel it first.
        enqueue.cancel('caption');
        enqueue.raise({ type: 'captionOff' }, { id: 'caption', delay: CAPTION_MS });
        if (!context.muted) enqueue.sendTo('speech', { type: 'say', text: event.text });
      }),
    },
    // A take ends on cut, or early when the OS stops it: no later rep is in its file. A failed file is never played.
    // shortcut: a take the OS ended leaves the rest of the set unfilmed; roll again if that happens often.
    taken: {
      actions: enqueueActions(({ context: c, event: { uri, ok }, enqueue }) => {
        if (c.take?.uri === uri) enqueue.assign({ take: null });
        if (!ok)
          enqueue.assign({
            attempts: unclip(c.attempts, uri),
            results: c.results.map((set) => ({ ...set, attempts: unclip(set.attempts, uri) })),
          });
      }),
    },
    videoLost: { actions: sendTo('camcorder', { type: 'lost' }) },
    // Outside counting.flipping (paused mid-flip, or the first start): just note the camera streams.
    cameraReady: { actions: assign({ flipPending: false }) },
    flashOff: { actions: assign({ flash: null }) },
    captionOff: { actions: assign({ caption: null }) },
  },
  initial: 'counting',
  states: {
    counting: {
      entry: assign({ stepStartedAt: ({ context }) => context.stepStartedAt ?? Date.now() }),
      invoke: { src: 'ticker' },
      // Films from the first frame out of 'waiting'. Pause, set end and `end` cut the take;
      // resume or restart rolls a new file, so each file maps onto the detector clock with one offset.
      initial: 'ready',
      states: {
        // After a flip, until the new camera streams: frames still in flight from the old one must not count or film.
        flipping: {
          on: {
            pose: { actions: ({ context, event }) => context.onPose?.(event.result, NOT_LIVE) },
            cameraReady: { target: 'ready', actions: assign({ flipPending: false }) },
          },
        },
        ready: {
          always: [
            // Resumed from a pause taken mid-flip: keep waiting for the new camera.
            { guard: ({ context }) => context.flipPending, target: 'flipping' },
            // On a frame only: a phase left over from before a pause must not start filming.
            {
              guard: ({ context, event }) =>
                event.type === 'pose' &&
                context[lastExercise(context).exercise].phase !== 'waiting',
              target: 'filming',
            },
          ],
        },
        filming: {
          entry: sendTo('camcorder', { type: 'roll' }),
          exit: [sendTo('camcorder', { type: 'cut' }), assign({ take: null })],
          on: {
            rolling: {
              actions: assign({ take: ({ event }) => ({ uri: event.uri, startMs: null }) }),
            },
          },
        },
      },
      on: {
        pose: {
          // Each result steps the current counter once, here; context is the only record of the count.
          actions: enqueueActions(({ context: c, event: { result }, enqueue }) => {
            enqueue.sendTo('recorder', { type: 'frame', result });
            const t = result.timestampMs;
            const { exercise: id, goal } = lastExercise(c);
            const prev: Progress = c[id];
            const { next, patch, live } = stepCounter(c, id, result, t);
            c.onPose?.(result, live);
            enqueue.assign(patch);

            const { take } = c;
            if (take && take.startMs === null) enqueue.assign({ take: { ...take, startMs: t } });

            const rep = next.lastRep;
            if (rep && (next.reps > prev.reps || next.noReps > prev.noReps)) {
              const { counted, depth } = rep;
              if (depth !== null) {
                const attempt: Attempt = { counted, depth, cue: rep.cues[0] ?? null };
                // Only a bottom filmed by the live take: not before it started, and `taken` clears it once it ends.
                const atMs =
                  take && take.startMs !== null ? clipTime(take.startMs, t, rep.upMs) : -1;
                enqueue.assign({
                  attempts: [
                    ...c.attempts,
                    take && atMs >= 0 ? { ...attempt, clip: { uri: take.uri, atMs } } : attempt,
                  ],
                });
              }
              enqueue.assign({ flash: counted ? 'rep' : 'noRep' });
              enqueue.cancel('flash');
              const delay = counted ? REP_FLASH_MS : NO_REP_FLASH_MS;
              enqueue.raise({ type: 'flashOff' }, { id: 'flash', delay });
            }
            // `ending` announces the final rep or MAX hold break; "Go" only before the first attempt.
            const text =
              (!done(goal, next) ? repPhrase(prev, next, rep?.cues) : null) ??
              (c.attempts.length || prev.heldMs > 0 ? null : startPhrase(prev.phase, next.phase));
            if (text) enqueue.raise({ type: 'say', text });

            const parts =
              next.phase === 'waiting' ? outOfFrame(result.landmarks, EXERCISES[id].parts) : null;
            const framing = settle(c, parts, t);
            if (framing.patch) enqueue.assign(framing.patch);
            if (framing.phrase) enqueue.raise({ type: 'say', text: framing.phrase });
          }),
        },
        next: 'ending',
        pause: 'paused',
        // Back to the start position on the new camera; cuts a take that began before any attempt.
        flipCamera: {
          guard: ({ context }) => context.attempts.length === 0,
          target: '.flipping',
          actions: [
            sendTo('recorder', { type: 'drop' }),
            assign(({ context }) => ({
              ...FRESH_SET,
              // This targets a child of counting, so counting's entry action does not run again.
              stepStartedAt: Date.now(),
              camera: flip(context),
              flipPending: true,
            })),
          ],
        },
        end: {
          target: 'finished',
          actions: [
            sendTo('recorder', ({ context }) => saveTrace(context)),
            assign({ results: ({ context }) => withSet(context) }),
          ],
        },
      },
      always: {
        guard: ({ context }) =>
          done(current(context).goal, context[lastExercise(context).exercise]),
        target: 'ending',
      },
    },
    // Detector frames keep arriving (root `pose`) but nothing counts, so resuming needs the start position again.
    paused: {
      entry: assign(({ context }) => expireCounter(context, lastExercise(context).exercise)),
      on: {
        resume: 'counting',
        restart: {
          target: 'counting',
          actions: [sendTo('recorder', { type: 'drop' }), assign(FRESH_SET)],
        },
        // Earlier sets stay; the take was already cut on entering paused.
        flipCamera: {
          target: 'counting.flipping',
          actions: [
            sendTo('recorder', { type: 'drop' }),
            assign(({ context }) => ({
              ...FRESH_SET,
              camera: flip(context),
              flipPending: true,
            })),
          ],
        },
        end: [
          {
            guard: ({ context }) => context.stepStartedAt !== null,
            target: 'finished',
            actions: [
              sendTo('recorder', ({ context }) => saveTrace(context)),
              assign({ results: ({ context }) => withSet(context) }),
            ],
          },
          { target: 'finished' },
        ],
      },
    },
    ending: {
      entry: enqueueActions(({ context, enqueue }) => {
        enqueue.sendTo('recorder', saveTrace(context));
        enqueue.assign({ results: withSet(context) });
        const { exercise: id, goal } = lastExercise(context);
        const { reps, heldMs, broken, lastRep } = context[id];
        const amount =
          EXERCISES[id].kind === 'hold' ? `${Math.floor(heldMs / 1000)} seconds` : String(reps);
        const next = context.steps[context.step + 1];
        const text = setPhrase(
          amount,
          !next
            ? null
            : next.exercise === 'rest'
              ? { rest: next.goal.type === 'seconds' ? next.goal.n : null }
              : {
                  what:
                    next.goal.type === 'reps'
                      ? `${next.goal.n} ${EXERCISES[next.exercise].name}`
                      : next.goal.type === 'seconds'
                        ? `${EXERCISES[next.exercise].name} ${next.goal.n} seconds`
                        : EXERCISES[next.exercise].name,
                  place: samePlacement(context) ? null : EXERCISES[next.exercise].place,
                },
        );
        // Speech cuts the previous phrase, so keep a MAX break's cue and completion together.
        const cue = goal.type === 'max' && broken ? lastRep?.cues[0] : null;
        enqueue.raise({ type: 'say', text: cue ? `${cue}. ${text}` : text });
      }),
      always: ADVANCE,
    },
    countdown: {
      entry: enqueueActions(({ context, enqueue }) => {
        // Keep the preceding completion phrase audible; the first numeral is visual only.
        if (context.countdown < 3) enqueue.raise({ type: 'say', text: String(context.countdown) });
      }),
      after: {
        1000: [
          {
            guard: ({ context }) => context.countdown > 1,
            target: 'countdown',
            reenter: true,
            actions: assign({ countdown: ({ context }) => context.countdown - 1 }),
          },
          { target: 'counting' },
        ],
      },
      // The platter's button skips the countdown: the next step is already current.
      on: { pause: 'paused', end: 'finished', next: 'counting' },
    },
    resting: {
      invoke: { src: 'ticker' },
      after: {
        rest: {
          guard: 'restIsTimed',
          actions: [
            assign(({ context }) => {
              const goal = current(context).goal;
              if (goal.type !== 'seconds') return {};
              // The deadline can fire before the ticker's final second; credit the full rest.
              return { elapsedS: context.elapsedS + goal.n - context.stepS, stepS: goal.n };
            }),
            raise({ type: 'next' }),
          ],
        },
      },
      on: { next: ADVANCE, end: 'finished' },
    },
    switching: {
      invoke: { src: 'ticker' },
      on: {
        // The finished set's result was saved by `ending`.
        end: 'finished',
        next: {
          target: 'counting',
          // Rotate only now: the between-sets prompt stays in the finished set's orientation.
          actions: [
            'nextStep',
            sendTo('orientation', ({ context }) => ({
              type: 'lock',
              orientation: orientation(EXERCISES[lastExercise(context).exercise].placement),
            })),
          ],
        },
      },
    },
    finished: {
      entry: [
        sendTo('camcorder', { type: 'wrap' }),
        // The Done summary is a portrait page, whatever the last set was.
        sendTo('orientation', { type: 'lock', orientation: 'portrait' }),
      ],
      // Only now is every file final (failed ones unclipped), so the best is safe to play and the rest can go.
      on: {
        wrapped: {
          actions: enqueueActions(({ context, enqueue }) => {
            const best = bestRep(context.results);
            enqueue.assign({ best });
            enqueue.sendTo('camcorder', { type: 'keep', uri: best?.uri ?? null });
          }),
        },
      },
    },
  },
});

/** What the screen renders. Hides the keyed counters and per-exercise report types. */
export type SessionView = ReturnType<typeof sessionView>;

/** Selector for useSelector(..., shallowEqual). Pure. */
export function sessionView(snapshot: SnapshotFrom<typeof workoutSession>) {
  const c = snapshot.context;
  const { exercise: id, goal } = lastExercise(c);
  const { round, rounds } = current(c);
  const tally: Progress = c[id];
  const unit: 'reps' | 'seconds' = EXERCISES[id].kind === 'hold' ? 'seconds' : 'reps';
  const after = c.steps.slice(c.step + 1).find((step) => step.exercise !== 'rest');
  // Annotated: an inferred literal would widen to string in the returned object.
  const stage: 'counting' | 'countdown' | 'resting' | 'paused' | 'switching' | 'finished' =
    snapshot.matches('switching')
      ? 'switching'
      : snapshot.matches('finished')
        ? 'finished'
        : snapshot.matches('resting')
          ? 'resting'
          : snapshot.matches('countdown')
            ? 'countdown'
            : snapshot.matches('paused')
              ? 'paused'
              : 'counting';
  // Annotated to hide the per-exercise counter types.
  const next: Omit<
    Exercise<Progress, Measured>,
    'initial' | 'measure' | 'step' | 'stats' | 'reset' | 'live'
  > | null = after ? EXERCISES[after.exercise] : null;
  return {
    stage,
    /** The current set's exercise; in switching and finished, the set just done. */
    exercise: id,
    name: EXERCISES[id].name,
    /** Infinity = open-ended. */
    target: repTarget(goal),
    unit,
    heldS: Math.floor(tally.heldMs / 1000),
    goalS: goal.type === 'seconds' ? goal.n : Infinity,
    countdown: stage === 'countdown' ? c.countdown : null,
    rest: stage === 'resting' ? restView(c) : null,
    samePlacement: samePlacement(c),
    reps: tally.reps,
    phase: tally.phase,
    /** This set has an attempt or held time; from then on 'waiting' means lost, not set-up. */
    started: c.attempts.length > 0 || tally.heldMs > 0,
    /** Finished through the last step rather than `end`. */
    completed: c.completed,
    /** 1-based. */
    set: c.steps.slice(0, c.step + 1).filter((step) => step.exercise !== 'rest').length,
    sets: c.steps.filter((step) => step.exercise !== 'rest').length,
    round,
    rounds,
    /** The set after this one (stable references, for shallowEqual). */
    next,
    nextGoal: after?.goal ?? null,
    /** Whole seconds; ticks while counting, switching or resting. */
    elapsedS: c.elapsedS,
    muted: c.muted,
    skeleton: c.skeleton,
    camera: c.camera,
    /** The last phrase the coach said (set even when muted); cleared ~3 s later. */
    caption: c.caption,
    /** Body parts out of frame while phase is 'waiting', ~1 s stable; [] when all in or not waiting. */
    // Ending a set while still waiting would otherwise carry its parts into switching.
    missing: stage === 'counting' ? c.missing : NONE,
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
    /** A take is being filmed (the REC dot). */
    recording: c.take !== null,
    /** The deepest filmed counted rep of the challenge, once finished and its file is ready; null if none. */
    best: c.best,
  };
}
