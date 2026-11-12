import { createPoseLandmarker, type PoseDetection, type PoseLandmarker } from 'superhabit-pose';
import { uuid } from 'expo';
import {
  assign,
  cancel,
  enqueueActions,
  fromCallback,
  raise,
  sendTo,
  setup,
  stopChild,
} from 'xstate';

import {
  countFrame,
  current,
  expireCounter,
  lastExercise,
  samePlacement,
  started,
  stepDetails,
  type Counting,
  type Live,
} from './counting';
import { completedSetPhrase } from '@/workout/coach/phrase';
import { speech } from '@/workout/coach/speech';
import { recorder, type RecorderEvent } from '@/workout/capture/recorder';
import { keepAwake } from './keep-awake';
import { orientationLock } from './orientation-lock';
import { NONE } from './framing';

import { EXERCISES, initialCounters, orientation } from '@/exercises/registry';

import { finishSet, type StepResult } from '@/workout/plan/results';
import { camcorder, type VideoOutput } from '@/workout/capture/camcorder';
import { roomToFilm } from '@/storage/set-files';
import { appAway, type AwayEvent } from './app-away';
import { workoutLog } from '@/workout/log';
import type { LogTarget } from '@/workout/store';
import { done, expand, type Challenge } from '@/workout/plan/plan';

type Events =
  | { type: 'ready'; landmarker: PoseLandmarker }
  | { type: 'pose'; result: PoseDetection }
  | { type: 'next' } // counting: end the set; resting: skip rest; switching: the phone is in place
  | { type: 'pause' } // counting or countdown
  | AwayEvent // the app left the screen or came back: a set or countdown pauses, you resume
  | { type: 'resume' } // paused
  | { type: 'restart' } // paused: zero the current set and count again
  | { type: 'end' } // any stage but finished: finish now, keeping results so far
  | { type: 'toggleVoice' }
  | { type: 'toggleSkeleton' }
  // Only before the set's first attempt: switch camera and reset its start position.
  | { type: 'flipCamera' }
  | { type: 'cameraReady' } // the camera's preview streams again (after a flip)
  | { type: 'videoLost' } // the camera dropped the video output: nothing more can be filmed
  | { type: 'cameraFailed' } // the camera failed again without video: the set pauses until you retry it
  | { type: 'trackingFailed' } // the detector can't start on this phone: only End is left
  | { type: 'save'; onLeave?: () => void } // finished: Done; the workout is kept once the log says so
  | { type: 'discard'; onLeave?: () => void } // finished: leave without keeping the workout
  | { type: 'logSaved' } // the log saved the workout
  | { type: 'logDiscarded' } // the log threw the workout away
  | { type: 'logFailed' } // the log couldn't write a set or Done
  // Internal.
  | { type: 'tick' }
  | { type: 'idleEnded' }
  | { type: 'say'; text: string }
  | { type: 'rolling'; setId: string; uri: string } // the camcorder's take really started
  | { type: 'taken'; uri: string; ok: boolean } // a take's file is final; not ok: unusable
  | { type: 'wrapped' } // the camcorder finished every file of the session
  | { type: 'flashOff' }
  | { type: 'captionOff' };

type OnPose = (result: PoseDetection, live: Live, drawSkeleton: boolean) => void;
/** `video`: the camera's video output (also passed to PoseCamera); without it nothing is filmed. */
type Input = {
  challenge: Challenge;
  /** Known before the session starts, to tell this workout from one an earlier session left open. */
  workoutId: string;
  /** What the workout counts toward; the log keeps it with the workout. */
  target: LogTarget;
  /** When the session started: the workout's day and start time. */
  start: Date;
  onPose?: OnPose;
  video?: VideoOutput;
  onFailure?: () => void;
};

/** One counter per exercise. `step` indexes expanded steps; switching still points to the finished step. */
type Context = Counting & {
  landmarker: PoseLandmarker | null;
  onPose?: OnPose;
  video?: VideoOutput;
  details: ReturnType<typeof stepDetails>;
  counted: boolean;
  onLeave?: () => void;
  onFailure?: () => void;
  /** The camera dropped the video output: nothing more is filmed this session. */
  videoLost: boolean;
  /** Too little free space at the start: the session counts without filming. */
  lowSpace: boolean;
  stepS: number;
  stepStartedAt: number | null;
  workoutId: string;
  target: LogTarget;
  start: Date;
  setId: string;
  countdown: number;
  /** Ran through the last step, even with zero reps via next; `end` leaves it false. */
  reachedEnd: boolean;
  elapsedS: number;
  /** Active tracking only: excludes setup, camera flips, pauses, countdowns and rest. */
  trackingS: number;
  /** A recorded attempt or tracking failure; survives restarting a set or retrying the camera. */
  feedbackEligible: boolean;
  muted: boolean;
  /** Draw the skeleton over the camera; detection runs either way. */
  skeleton: boolean;
  // shortcut: not persisted, every run starts on the front camera; store it if people keep flipping.
  camera: 'front' | 'back';
  /** A flip is waiting for the new camera to stream; survives a pause, so resuming can't count old frames. */
  flipPending: boolean;
  caption: string | null;
  flash: 'rep' | 'noRep' | null;
  /** This set's files so far, in order: a pause or resume starts a new one. */
  takes: readonly string[];
  results: readonly StepResult[];
  /** The file being filmed. */
  take: string | null;
  /** The app is off the screen: nothing starts counting until you resume. */
  away: boolean;
  /** Counting can't go on: the camera stopped (retry it) or the detector can't start (end). */
  broken: 'camera' | 'tracking' | null;
  /** Bumped on each camera retry: the screen mounts the camera afresh. */
  cameraTry: number;
};

// Ten minutes gives time to adjust the phone, but ends an abandoned workout before it drains the battery.
const IDLE_MS = 10 * 60 * 1000;
const CAPTION_MS = 3000;
const REP_FLASH_MS = 600;
const NO_REP_FLASH_MS = 1000;
/** Seconds of "get ready" before a set that keeps the phone where it is. */
export const COUNTDOWN_S = 3;
const NOT_LIVE: Live = { angle: null, lowest: null, joints: null };

/** What a new or restarted set starts from. */
const freshSet = () =>
  ({
    setId: uuid.v4(),
    ...initialCounters,
    attempts: [],
    takes: [],
    missing: NONE,
    candidate: null,
    framed: false,
    stepStartedAt: null,
  }) satisfies Partial<Context>;

/** Owns the native detector for as long as the session runs; native pushes each result to JS. */
const landmarker = fromCallback<Events>(({ sendBack }) => {
  const instance = createPoseLandmarker();
  instance.onResult = (result) => sendBack({ type: 'pose', result });
  instance.onFailed = (message) => {
    console.error('[pose] the detector could not start', message);
    sendBack({ type: 'trackingFailed' });
  };
  sendBack({ type: 'ready', landmarker: instance });
  return () => instance.close();
});

/** Ticks once a second for as long as it is invoked, so elapsed time only runs in those states. */
const ticker = fromCallback(({ sendBack }) => {
  const id = setInterval(() => sendBack({ type: 'tick' }), 1000);
  return () => clearInterval(id);
});

type Actors = {
  awake: typeof keepAwake;
  landmarker: typeof landmarker;
  speech: typeof speech;
  orientation: typeof orientationLock;
  ticker: typeof ticker;
  camcorder: typeof camcorder;
  recorder: typeof recorder;
  log: typeof workoutLog;
  away: typeof appAway;
};

const isLast = (c: Context) => c.step === c.steps.length - 1;
const nextIsRest = (c: Context) => c.steps[c.step + 1]?.exercise === 'rest';

/** The UI orientation of the exercise shown. */
const lockFor = (c: Context) => orientation(EXERCISES[lastExercise(c).exercise].placement);

const flip = (c: Context) => (c.camera === 'front' ? 'back' : 'front');

function saveTrace(c: Context): RecorderEvent {
  const { exercise } = lastExercise(c);
  const { reps, heldMs } = c[exercise];
  return {
    type: 'save',
    counted: EXERCISES[exercise].kind === 'hold' ? { heldMs } : { reps },
  };
}

function traceStage(c: Context, kind: 'countdown' | 'waiting' | 'paused'): RecorderEvent {
  return {
    type: 'stage',
    kind,
    setId: c.setId,
    exercise: lastExercise(c).exercise,
    camera: c.camera,
  };
}

const without = (takes: readonly string[], uri: string) => takes.filter((take) => take !== uri);

/**
 * One workout. Detector, speech and orientation lock live for the whole run (root invokes),
 * so the model loads once and the dots keep drawing while the phone is moved.
 *
 *   counting --(target reached | next)--> ending --> finished | resting | countdown | switching
 *      ^ |                                          resting --(timeout | next)--> countdown | switching
 *      | |                                          countdown --(COUNTDOWN_S | next)--> counting
 *      | |                                          switching --next--> counting (step + 1)
 *      | pause (also from countdown)
 *   paused --resume | restart--> counting;  end: any stage but finished --> finished
 *
 * Leaving the app (`away`) pauses counting and countdown, and keeps a countdown or a Continue from starting a
 * set; a failed camera or detector (`broken`) does the same. You resume; a failed detector leaves only end.
 * Only `counting` steps a counter; countdown and paused frames also go to the recorder.
 * Everything said goes through `say`, so the caption is set even when muted.
 * finished is not `type: 'final'`: a final root state would stop speech and cut "Workout done".
 */
// Positional generics up to TInput (no type assertions allowed): children, actions, guards, delays, tags.
const session = setup<
  Context,
  Events,
  Actors,
  {},
  {
    elapse: undefined;
    nextStep: undefined;
    countFrame: undefined;
    saveSet: undefined;
    flipSet: undefined;
    suspendedFrame: undefined;
    waitIdle: undefined;
  },
  {
    isLast: undefined;
    nextIsRest: undefined;
    samePlacement: undefined;
    restIsTimed: undefined;
    unavailable: undefined;
    waiting: undefined;
  },
  'rest' | 'idle',
  string,
  Input
>({
  actors: {
    awake: keepAwake,
    landmarker,
    speech,
    orientation: orientationLock,
    ticker,
    camcorder,
    recorder,
    log: workoutLog,
    away: appAway,
  },
  actions: {
    elapse: assign({
      elapsedS: ({ context }) => context.elapsedS + 1,
      stepS: ({ context }) => context.stepS + 1,
    }),
    waitIdle: enqueueActions(({ context, enqueue }) => {
      enqueue.cancel('idle');
      if (!context.away) enqueue.raise({ type: 'idleEnded' }, { id: 'idle', delay: 'idle' });
    }),
    suspendedFrame: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'pose') return;
      const { phase } = context[lastExercise(context).exercise];
      enqueue.sendTo('recorder', {
        type: 'frame',
        result: event.result,
        phase,
        // Replay (exercises/__fixtures__/replay.ts) skips frames with this reason; rename both together.
        waiting: phase === 'waiting' ? 'counter suspended' : null,
      });
      context.onPose?.(event.result, NOT_LIVE, context.skeleton);
    }),
    nextStep: assign(({ context }) => ({
      // During a rest the view still shows the exercise just finished.
      ...(nextIsRest(context) ? {} : freshSet()),
      step: context.step + 1,
      stepS: 0,
    })),
    // Each result steps the current counter once (counting.ts); context is the only record of the count.
    countFrame: enqueueActions(({ context: c, event, enqueue }) => {
      if (event.type !== 'pose') return;
      const { result } = event;
      const { update, live, flash, say, phase, waiting } = countFrame(c, result);
      enqueue.sendTo('recorder', { type: 'frame', result, phase, waiting });
      enqueue.sendTo('camcorder', { type: 'frame', timestampMs: result.timestampMs });
      c.onPose?.(result, live, c.skeleton);
      enqueue.assign({
        ...update,
        feedbackEligible: c.feedbackEligible || started({ ...c, ...update }),
      });
      if (flash) {
        enqueue.assign({ flash });
        enqueue.cancel('flash');
        const delay = flash === 'rep' ? REP_FLASH_MS : NO_REP_FLASH_MS;
        enqueue.raise({ type: 'flashOff' }, { id: 'flash', delay });
      }
      for (const text of say) enqueue.raise({ type: 'say', text });
    }),
    // The current set joins the results and log before advancing, so an interrupted run keeps it.
    saveSet: enqueueActions(({ context, enqueue }) => {
      enqueue.sendTo('camcorder', { type: 'logged', setId: context.setId });
      enqueue.sendTo('recorder', saveTrace(context));
      const set = finishSet(context, {
        ...lastExercise(context),
        id: context.setId,
        workoutId: context.workoutId,
        planStep: context.step,
        startedAt: context.stepStartedAt ?? Date.now(),
        attempts: context.attempts,
        takes: context.takes,
      });
      enqueue.sendTo('log', { type: 'set', set });
      enqueue.assign({
        results: [...context.results, set],
        counted: context.counted || set.reps + set.noReps > 0 || set.heldMs > 0,
      });
    }),
    // Back to the start position on the other camera; waits in counting.flipping for it to stream.
    flipSet: enqueueActions(({ context, enqueue }) => {
      enqueue.assign({
        ...freshSet(),
        // A flip inside counting targets its child, so counting's entry does not stamp the start again.
        stepStartedAt: Date.now(),
        camera: flip(context),
        flipPending: true,
      });
      enqueue.sendTo('recorder', ({ context }) => traceStage(context, 'waiting'));
    }),
  },
  guards: {
    unavailable: ({ context }) => context.broken !== null || context.away,
    waiting: ({ context }) => context[lastExercise(context).exercise].phase === 'waiting',
    isLast: ({ context }) => isLast(context),
    nextIsRest: ({ context }) => nextIsRest(context),
    samePlacement: ({ context }) => samePlacement(context),
    restIsTimed: ({ context }) => current(context).goal.type === 'seconds',
  },
  delays: {
    idle: IDLE_MS,
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
  context: ({ input }) => {
    const steps = expand(input.challenge.session);
    const lowSpace = input.video !== undefined && !roomToFilm();
    return {
      ...freshSet(),
      workoutId: input.workoutId,
      target: input.target,
      start: input.start,
      landmarker: null,
      onPose: input.onPose,
      video: lowSpace ? undefined : input.video,
      videoLost: false,
      lowSpace,
      steps,
      details: stepDetails(steps),
      counted: false,
      onFailure: input.onFailure,
      step: 0,
      stepS: 0,
      countdown: COUNTDOWN_S,
      reachedEnd: false,
      elapsedS: 0,
      trackingS: 0,
      feedbackEligible: false,
      muted: false,
      skeleton: true,
      camera: 'front',
      flipPending: false,
      caption: null,
      flash: null,
      results: [],
      take: null,
      away: false,
      broken: null,
      cameraTry: 0,
    };
  },
  invoke: [
    { src: 'awake', id: 'awake', input: ({ context }) => context.workoutId },
    { src: 'landmarker' },
    { src: 'away' },
    { src: 'speech', id: 'speech' },
    {
      src: 'orientation',
      id: 'orientation',
      input: ({ context }) => lockFor(context),
    },
    {
      src: 'camcorder',
      id: 'camcorder',
      input: ({ context, self }) => ({
        video: context.video,
        onTake: (event) => self.getSnapshot().children.recorder?.send(event),
      }),
    },
    {
      src: 'recorder',
      id: 'recorder',
    },
    {
      src: 'log',
      id: 'log',
      input: ({ context: { workoutId, target, start } }) => ({ workoutId, target, start }),
    },
  ],
  on: {
    ready: { actions: assign({ landmarker: ({ event }) => event.landmarker }) },
    pose: {
      actions: ({ context, event }) => context.onPose?.(event.result, NOT_LIVE, context.skeleton),
    },
    tick: { actions: 'elapse' },
    // Never counting while you can't see it: a set or countdown pauses (a raised `pause` only those take),
    // and one reached meanwhile from a timed rest pauses too. Coming back leaves it paused.
    away: { actions: [assign({ away: true }), cancel('idle'), raise({ type: 'pause' })] },
    back: { actions: assign({ away: false }) },
    cameraFailed: {
      // A failed detector stays the reason: retrying the camera can't bring it back.
      actions: [
        assign({
          broken: ({ context }) => (context.broken === 'tracking' ? 'tracking' : 'camera'),
          feedbackEligible: true,
        }),
        raise({ type: 'pause' }),
      ],
    },
    // Once the detector failed it stays failed: a camera retry can't bring it back.
    trackingFailed: {
      actions: [assign({ broken: 'tracking', feedbackEligible: true }), raise({ type: 'pause' })],
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
    rolling: {
      actions: assign(({ context, event, self }) => {
        const current = event.setId === context.setId;
        if (!current && !context.results.some((set) => set.id === event.setId)) return {};
        return {
          ...(current ? { takes: [...context.takes, event.uri] } : {}),
          ...(current && self.getSnapshot().matches({ counting: 'filming' })
            ? { take: event.uri }
            : {}),
          results: context.results.map((set) =>
            set.id === event.setId ? { ...set, takes: [...set.takes, event.uri] } : set,
          ),
        };
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
      entry: [
        assign({ stepStartedAt: ({ context }) => context.stepStartedAt ?? Date.now() }),
        sendTo('recorder', ({ context }) => traceStage(context, 'waiting')),
      ],
      invoke: { src: 'ticker' },
      // Films from the first frame out of 'waiting'. Pause, set end and `end` cut the take;
      // resume or restart rolls a new file.
      initial: 'ready',
      states: {
        // After a flip, until the new camera streams: frames still in flight from the old one must not count or film.
        flipping: {
          entry: 'waitIdle',
          exit: cancel('idle'),
          on: {
            idleEnded: { actions: raise({ type: 'end' }) },
            back: { actions: [assign({ away: false }), 'waitIdle'] },
            pose: {
              actions: ({ context, event }) =>
                context.onPose?.(event.result, NOT_LIVE, context.skeleton),
            },
            cameraReady: { target: 'ready', actions: assign({ flipPending: false }) },
          },
        },
        ready: {
          entry: 'waitIdle',
          exit: cancel('idle'),
          on: {
            idleEnded: { actions: raise({ type: 'end' }) },
            back: { actions: [assign({ away: false }), 'waitIdle'] },
          },
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
          initial: 'active',
          states: {
            active: { always: { guard: 'waiting', target: 'idle' } },
            idle: {
              entry: 'waitIdle',
              exit: cancel('idle'),
              on: {
                idleEnded: { actions: raise({ type: 'end' }) },
                back: { actions: [assign({ away: false }), 'waitIdle'] },
              },
              always: {
                guard: ({ context }) => context[lastExercise(context).exercise].phase !== 'waiting',
                target: 'active',
              },
            },
          },
          entry: sendTo('camcorder', ({ context }) => ({ type: 'roll', setId: context.setId })),
          exit: [sendTo('camcorder', { type: 'cut' }), assign({ take: null })],
        },
      },
      on: {
        tick: {
          actions: [
            'elapse',
            assign({
              trackingS: ({ context }) =>
                context.trackingS +
                (context.framed &&
                !context.flipPending &&
                context[lastExercise(context).exercise].phase !== 'waiting'
                  ? 1
                  : 0),
            }),
          ],
        },
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
      always: [
        // Reached while the camera or detector is down, or by a tap queued as the app left: nothing counts.
        { guard: 'unavailable', target: 'paused' },
        {
          guard: ({ context }) =>
            done(current(context).goal, context[lastExercise(context).exercise]),
          target: 'ending',
        },
      ],
    },
    // Paused frames are recorded without counting, so resuming needs the start position again.
    paused: {
      entry: [
        'waitIdle',
        assign(({ context }) => expireCounter(context, lastExercise(context).exercise)),
        sendTo('recorder', ({ context }) => traceStage(context, 'paused')),
      ],
      exit: cancel('idle'),
      on: {
        idleEnded: { actions: raise({ type: 'end' }) },
        back: { actions: [assign({ away: false }), 'waitIdle'] },
        pose: { actions: 'suspendedFrame' },
        // Counting itself sends a session with a failed detector straight back here.
        resume: [
          {
            guard: ({ context }) => context.broken === 'camera',
            target: 'counting',
            actions: assign({ broken: null, cameraTry: ({ context }) => context.cameraTry + 1 }),
          },
          { target: 'counting' },
        ],
        restart: {
          guard: ({ context }) => context.broken === null,
          target: 'counting',
          actions: assign(() => freshSet()),
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
          const step = lastExercise(context);
          enqueue.raise({
            type: 'say',
            text: completedSetPhrase(step, context[step.exercise], context.steps[context.step + 1]),
          });
        }),
      ],
      always: ADVANCE,
    },
    countdown: {
      always: { guard: 'unavailable', target: 'paused' },
      entry: enqueueActions(({ context, enqueue }) => {
        enqueue.sendTo('recorder', traceStage(context, 'countdown'));
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
      // The next step is already current, so skipping needs no step advance.
      on: {
        pose: { actions: 'suspendedFrame' },
        pause: 'paused',
        end: 'finished',
        next: 'counting',
      },
    },
    resting: {
      entry: 'waitIdle',
      exit: cancel('idle'),
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
      on: {
        pose: { actions: ({ context, event }) => context.onPose?.(event.result, NOT_LIVE, false) },
        idleEnded: {
          guard: ({ context }) => current(context).goal.type === 'max',
          actions: raise({ type: 'end' }),
        },
        back: { actions: [assign({ away: false }), 'waitIdle'] },
        next: ADVANCE,
        end: 'finished',
      },
    },
    switching: {
      entry: 'waitIdle',
      exit: cancel('idle'),
      invoke: { src: 'ticker' },
      on: {
        idleEnded: { actions: raise({ type: 'end' }) },
        back: { actions: [assign({ away: false }), 'waitIdle'] },
        pose: {
          actions: ({ context, event }) =>
            context.onPose?.(event.result, NOT_LIVE, context.skeleton),
        },
        // The finished set's result was saved by `ending`.
        end: 'finished',
        next: [
          {
            // The camera or detector failed, or the app left, between sets: the next set waits, unstarted,
            // so End keeps only what was counted.
            guard: 'unavailable',
            target: 'paused',
            actions: [
              'nextStep',
              sendTo('orientation', ({ context }) => ({
                type: 'lock',
                orientation: lockFor(context),
              })),
            ],
          },
          {
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
        ],
      },
    },
    finished: {
      type: 'parallel',
      entry: [
        stopChild('awake'),
        sendTo('camcorder', { type: 'wrap' }),
        // The Done summary is a portrait page, whatever the last set was.
        sendTo('orientation', { type: 'lock', orientation: 'portrait' }),
      ],
      states: {
        files: {
          initial: 'wrapping',
          states: {
            wrapping: {
              always: { guard: ({ context }) => context.video === undefined, target: 'ready' },
              on: { wrapped: 'ready' },
            },
            ready: {},
          },
        },
        decision: {
          initial: 'reviewing',
          states: {
            reviewing: {
              on: {
                save: {
                  target: 'saving',
                  actions: assign({ onLeave: ({ event }) => event.onLeave }),
                },
                discard: {
                  target: 'discarding',
                  actions: assign({ onLeave: ({ event }) => event.onLeave }),
                },
              },
            },
            saving: {
              entry: sendTo('log', { type: 'done' }),
              on: { logSaved: 'kept', logFailed: 'failed' },
            },
            discarding: {
              entry: sendTo('log', { type: 'discard' }),
              on: { logDiscarded: 'discarded', logFailed: 'failed' },
            },
            failed: {
              entry: ({ context }) => context.onFailure?.(),
              on: {
                save: {
                  target: 'saving',
                  actions: assign({ onLeave: ({ event }) => event.onLeave }),
                },
                discard: {
                  target: 'discarding',
                  actions: assign({ onLeave: ({ event }) => event.onLeave }),
                },
              },
            },
            kept: { entry: ({ context }) => context.onLeave?.() },
            discarded: { entry: ({ context }) => context.onLeave?.() },
          },
        },
      },
    },
  },
});
