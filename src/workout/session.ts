import { createPoseLandmarker, type PoseDetection, type PoseLandmarker } from 'superhabit-pose';
import { assign, enqueueActions, fromCallback, raise, sendTo, setup } from 'xstate';

import { endPhrase, repPhrase, startPhrase } from './phrase';
import { speech } from './speech';
import { recorder, type RecorderEvent } from './recorder';
import { orientationLock } from './orientation-lock';
import { NONE, settle, type Framing } from './framing';

import {
  EXERCISES,
  initialCounters,
  outOfFrame,
  orientation,
  type Counters,
  type ExerciseId,
  type Pose,
  type Progress,
} from '@/exercises/registry';

import { setAmounts, shareDone, type Attempt, type StepResult } from './results';
import { camcorder, type VideoOutput } from './camcorder';
import { done, expand, type Challenge, type FlatSteps } from './plan';

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
  | { type: 'shareTraces'; share: boolean } // finished: keep this session's traces for sending, or not
  // Internal.
  | { type: 'tick' }
  | { type: 'say'; text: string }
  | { type: 'rolling'; uri: string } // the camcorder's take really started
  | { type: 'taken'; uri: string; ok: boolean } // a take's file is final; not ok: unusable
  | { type: 'wrapped' } // the camcorder finished every file of the session
  | { type: 'flashOff' }
  | { type: 'captionOff' };

type OnPose = (result: PoseDetection, live: Live) => void;
/** `video`: the camera's video output (also passed to PoseCamera); without it nothing is filmed. */
type Input = {
  challenge: Challenge;
  onPose?: OnPose;
  /**
   * After every set joins the results, so a killed app keeps what was done: how much of the session is
   * done, 0 to 1 (1 = every goal met), and what each exercise set got (`setAmounts`). Only ever grows.
   */
  onSaved?: (share: number, sets: number[]) => void;
  video?: VideoOutput;
  record?: boolean;
};

/** One counter per exercise. `step` indexes expanded steps; switching still points to the finished step. */
type Context = Counters &
  Framing & {
    landmarker: PoseLandmarker | null;
    /** A detector frame was handled this set; until then nothing is known about framing. */
    framed: boolean;
    onPose?: OnPose;
    onSaved?: Input['onSaved'];
    video?: VideoOutput;
    record: boolean;
    /** The camera dropped the video output: nothing more is filmed this session. */
    videoLost: boolean;
    steps: FlatSteps;
    step: number;
    stepS: number;
    stepStartedAt: number | null;
    countdown: number;
    /** Ran through the last step, even with zero reps via next; `end` leaves it false. */
    reachedEnd: boolean;
    elapsedS: number;
    muted: boolean;
    /** Draw the skeleton over the camera; detection runs either way. */
    skeleton: boolean;
    // shortcut: not persisted, every run starts on the front camera; store it if people keep flipping.
    camera: 'front' | 'back';
    /** A flip is waiting for the new camera to stream; survives a pause, so resuming can't count old frames. */
    flipPending: boolean;
    caption: string | null;
    flash: 'rep' | 'noRep' | null;
    attempts: readonly Attempt[];
    /** This set's files so far, in order: a pause or resume starts a new one. */
    takes: readonly string[];
    results: readonly StepResult[];
    /** The file being filmed. */
    take: string | null;
    /** Results are safe to read: every file is final (failed ones dropped from their set). */
    final: boolean;
  };

const CAPTION_MS = 3000;
const REP_FLASH_MS = 600;
const NO_REP_FLASH_MS = 1000;
/** Seconds of "get ready" before a set that keeps the phone where it is. */
const COUNTDOWN_S = 3;
const NOT_LIVE: Live = { angle: null, lowest: null, joints: null };

/** What a new or restarted set starts from. */
const FRESH_SET = {
  ...initialCounters,
  attempts: [],
  takes: [],
  missing: NONE,
  candidate: null,
  framed: false,
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

type Actors = {
  landmarker: typeof landmarker;
  speech: typeof speech;
  orientation: typeof orientationLock;
  ticker: typeof ticker;
  camcorder: typeof camcorder;
  recorder: typeof recorder;
};

export const current = (c: Context) => c.steps[c.step];
const isLast = (c: Context) => c.step === c.steps.length - 1;
const nextIsRest = (c: Context) => c.steps[c.step + 1]?.exercise === 'rest';

/** Exercise shown by the runner, including when the current step is a rest. */
export function lastExercise(c: Context) {
  for (let i = c.step; i >= 0; i -= 1) {
    const step = c.steps[i];
    if (step.exercise !== 'rest') return step;
  }
  return c.steps[0];
}

export const samePlacement = (c: Context) => {
  const next = c.steps[c.step + 1];
  return (
    next !== undefined &&
    next.exercise !== 'rest' &&
    EXERCISES[next.exercise].placement === EXERCISES[lastExercise(c).exercise].placement
  );
};

/** This set has a rep, a failed one or held time; from then on 'waiting' means lost, not set-up. */
export const started = (c: Context) => {
  const { reps, noReps, heldMs }: Progress = c[lastExercise(c).exercise];
  return reps + noReps > 0 || heldMs > 0;
};

/** The UI orientation of the exercise shown. */
const lockFor = (c: Context) => orientation(EXERCISES[lastExercise(c).exercise].placement);

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

const without = (takes: readonly string[], uri: string) => takes.filter((take) => take !== uri);

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
  const set = {
    exercise: id,
    round,
    startedAt: c.stepStartedAt ?? Date.now(),
    endedAt: Date.now(),
    goal,
    reps,
    noReps,
    heldMs,
    attempts: c.attempts,
    takes: c.takes,
  };
  return [...c.results, { ...set, stats: statsOf(c, id) }];
}

/**
 * One challenge run. Detector, speech and orientation lock live for the whole run (root invokes),
 * so the model loads once and the dots keep drawing while the phone is moved.
 *
 *   counting --(target reached | next)--> ending --> finished | resting | countdown | switching
 *      ^ |                                          resting --(timeout | next)--> countdown | switching
 *      | |                                          countdown --(COUNTDOWN_S | next)--> counting
 *      | |                                          switching --next--> counting (step + 1)
 *      | pause (also from countdown)
 *   paused --resume | restart--> counting;  end: any stage but finished --> finished
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
  { nextStep: undefined; countFrame: undefined; saveSet: undefined; flipSet: undefined },
  { isLast: undefined; nextIsRest: undefined; samePlacement: undefined; restIsTimed: undefined },
  'rest',
  string,
  Input
>({
  actors: { landmarker, speech, orientation: orientationLock, ticker, camcorder, recorder },
  actions: {
    nextStep: assign(({ context }) => ({
      // During a rest the view still shows the exercise just finished.
      ...(nextIsRest(context) ? {} : FRESH_SET),
      step: context.step + 1,
      stepS: 0,
    })),
    // Each result steps the current counter once, here; context is the only record of the count.
    countFrame: enqueueActions(({ context: c, event, enqueue }) => {
      if (event.type !== 'pose') return;
      const { result } = event;
      if (c.record) enqueue.sendTo('recorder', { type: 'frame', result });
      const t = result.timestampMs;
      const { exercise: id, goal } = lastExercise(c);
      const prev: Progress = c[id];
      const { next, patch, live } = stepCounter(c, id, result, t);
      c.onPose?.(result, live);
      enqueue.assign(patch);

      // shortcut: event lines stay on in release builds for lab sessions (adb logcat -s ReactNativeJS);
      // drop them or gate them with the recorder setting before shipping.
      if (next.phase !== prev.phase)
        console.info('[session]', id, 'phase', prev.phase, '->', next.phase);
      const rep = next.lastRep;
      if (rep && (next.reps > prev.reps || next.noReps > prev.noReps)) {
        const { counted, depth } = rep;
        console.info('[session]', id, counted ? 'rep' : 'no-rep', next.reps, next.noReps);
        console.info('[session]', id, statsOf({ ...c, ...patch }, id));
        if (depth !== null)
          enqueue.assign({
            attempts: [...c.attempts, { counted, depth, cue: rep.cues[0] ?? null }],
          });
        enqueue.assign({ flash: counted ? 'rep' : 'noRep' });
        enqueue.cancel('flash');
        const delay = counted ? REP_FLASH_MS : NO_REP_FLASH_MS;
        enqueue.raise({ type: 'flashOff' }, { id: 'flash', delay });
      }
      // `ending` announces the final rep or MAX hold break; "Go" only before the first attempt.
      const text =
        (!done(goal, next) ? repPhrase(prev, next, rep?.cues) : null) ??
        (started(c) ? null : startPhrase(prev.phase, next.phase));
      if (text) enqueue.raise({ type: 'say', text });

      const parts =
        next.phase === 'waiting' ? outOfFrame(result.landmarks, EXERCISES[id].parts) : null;
      const framing = settle(c, parts, t);
      if (framing.patch) enqueue.assign(framing.patch);
      // Framing is known once the first reading is all in frame or has settled; until then the
      // checklist shows every part out, never a false all-clear.
      if (!c.framed && (!parts?.length || framing.patch?.missing !== undefined))
        enqueue.assign({ framed: true });
      if (framing.patch?.missing)
        console.info('[session]', id, 'out of frame', framing.patch.missing.join(', ') || 'none');
      if (framing.phrase) enqueue.raise({ type: 'say', text: framing.phrase });
    }),
    // The current set (finished or cut short) joins the results; its trace is saved when recording.
    saveSet: enqueueActions(({ context, enqueue }) => {
      const { exercise } = lastExercise(context);
      const { reps, noReps, heldMs } = context[exercise];
      console.info('[session]', exercise, 'set done', { reps, noReps, heldMs });
      enqueue.sendTo('recorder', saveTrace(context));
      const results = withSet(context);
      enqueue.assign({ results });
      const { steps, onSaved } = context;
      enqueue(() => onSaved?.(shareDone(steps, results), setAmounts(steps, results)));
    }),
    // Back to the start position on the other camera; waits in counting.flipping for it to stream.
    flipSet: enqueueActions(({ context, enqueue }) => {
      enqueue.sendTo('recorder', { type: 'drop' });
      enqueue.assign({
        ...FRESH_SET,
        // A flip inside counting targets its child, so counting's entry does not stamp the start again.
        stepStartedAt: Date.now(),
        camera: flip(context),
        flipPending: true,
      });
    }),
  },
  guards: {
    isLast: ({ context }) => isLast(context),
    nextIsRest: ({ context }) => nextIsRest(context),
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
  { guard: 'isLast', target: 'finished', actions: session.assign({ reachedEnd: true }) },
  { guard: 'nextIsRest', target: 'resting', actions: 'nextStep' },
  {
    guard: 'samePlacement',
    target: 'countdown',
    actions: ['nextStep', session.assign({ countdown: COUNTDOWN_S })],
  },
  { target: 'switching' },
] satisfies Parameters<typeof session.createStateConfig>[0]['always'];

export const workoutSession = session.createMachine({
  context: ({ input }) => ({
    ...FRESH_SET,
    landmarker: null,
    onPose: input.onPose,
    onSaved: input.onSaved,
    video: input.video,
    videoLost: false,
    record: input.record ?? false,
    steps: expand(input.challenge.session),
    step: 0,
    stepS: 0,
    countdown: COUNTDOWN_S,
    reachedEnd: false,
    elapsedS: 0,
    muted: false,
    skeleton: true,
    camera: 'front',
    flipPending: false,
    caption: null,
    flash: null,
    results: [],
    take: null,
    final: false,
  }),
  invoke: [
    { src: 'landmarker' },
    { src: 'speech', id: 'speech' },
    {
      src: 'orientation',
      id: 'orientation',
      input: ({ context }) => lockFor(context),
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
    // A take ends on cut, or early when the OS stops it. A failed file is never played.
    // shortcut: a take the OS ended leaves the rest of the set unfilmed; roll again if that happens often.
    taken: {
      actions: enqueueActions(({ context: c, event: { uri, ok }, enqueue }) => {
        if (c.take === uri) enqueue.assign({ take: null });
        if (!ok)
          enqueue.assign({
            takes: without(c.takes, uri),
            results: c.results.map((set) => ({ ...set, takes: without(set.takes, uri) })),
          });
      }),
    },
    // The camcorder still owns its files: it keeps wrapping up the takes it has.
    videoLost: { actions: [sendTo('camcorder', { type: 'lost' }), assign({ videoLost: true })] },
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
      // resume or restart rolls a new file.
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
              actions: assign(({ context, event }) => ({
                take: event.uri,
                takes: [...context.takes, event.uri],
              })),
            },
          },
        },
      },
      on: {
        pose: { actions: 'countFrame' },
        next: 'ending',
        pause: 'paused',
        // Cuts a take that began before any attempt.
        flipCamera: {
          guard: ({ context }) => !started(context),
          target: '.flipping',
          actions: 'flipSet',
        },
        end: { target: 'finished', actions: 'saveSet' },
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
        end: [
          {
            guard: ({ context }) => context.stepStartedAt !== null,
            target: 'finished',
            actions: 'saveSet',
          },
          { target: 'finished' },
        ],
      },
    },
    ending: {
      entry: [
        'saveSet',
        enqueueActions(({ context, enqueue }) => {
          const { exercise: id, goal } = lastExercise(context);
          const { reps, heldMs, broken, lastRep } = context[id];
          const heldS = Math.floor(heldMs / 1000);
          const amount =
            EXERCISES[id].kind === 'hold'
              ? `${heldS} ${heldS === 1 ? 'second' : 'seconds'}`
              : String(reps);
          const next = context.steps[context.step + 1];
          const upcoming = next
            ? {
                name: next.exercise === 'rest' ? null : EXERCISES[next.exercise].name,
                goal: next.goal,
                place:
                  next.exercise === 'rest' || samePlacement(context)
                    ? null
                    : EXERCISES[next.exercise].place,
              }
            : null;
          const cue = goal.type === 'max' && broken ? (lastRep?.cues[0] ?? null) : null;
          enqueue.raise({ type: 'say', text: endPhrase(amount, upcoming, cue) });
        }),
      ],
      always: ADVANCE,
    },
    countdown: {
      entry: enqueueActions(({ context, enqueue }) => {
        // Keep the preceding completion phrase audible; the first numeral is visual only.
        if (context.countdown < COUNTDOWN_S)
          enqueue.raise({ type: 'say', text: String(context.countdown) });
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
      // `next` skips the countdown: the next step is already current. The position check's
      // camera chip is live here too.
      on: {
        pause: 'paused',
        end: 'finished',
        next: 'counting',
        flipCamera: { target: 'counting.flipping', actions: 'flipSet' },
      },
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
              orientation: lockFor(context),
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
        // Without a video output the camcorder never films, so nothing is left to wait for.
        assign({ final: ({ context }) => context.video === undefined }),
      ],
      on: {
        shareTraces: {
          actions: [
            sendTo('recorder', ({ event }) => ({ type: 'share', on: event.share })),
            sendTo('camcorder', ({ event }) => ({ type: 'share', on: event.share })),
          ],
        },
        // Only now is every file final (failed ones dropped), so the sets are safe to play.
        wrapped: {
          actions: assign({ final: true }),
        },
      },
    },
  },
});
