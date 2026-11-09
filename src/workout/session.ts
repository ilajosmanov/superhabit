import { createPoseLandmarker, type PoseDetection, type PoseLandmarker } from 'superhabit-pose';
import { uuid } from 'expo';
import { assign, enqueueActions, fromCallback, raise, sendTo, setup } from 'xstate';

import {
  countFrame,
  current,
  expireCounter,
  lastExercise,
  samePlacement,
  started,
  type Counting,
  type Live,
} from './counting';
import { endPhrase } from './phrase';
import { speech } from './speech';
import { recorder, type RecorderEvent } from './recorder';
import { orientationLock } from './orientation-lock';
import { NONE } from './framing';

import { EXERCISES, initialCounters, orientation } from '@/exercises/registry';

import { finishSet, type StepResult } from './results';
import { camcorder, type VideoOutput } from './camcorder';
import type { LogEvent, LogInput } from './log';
import { done, expand, type Challenge } from './plan';

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
  | { type: 'save' } // finished: Done; the workout is kept once the log says so
  | { type: 'discard' } // finished: leave without keeping the workout
  | { type: 'logSaved' } // the log saved the workout
  | { type: 'logDiscarded' } // the log threw the workout away
  | { type: 'logFailed' } // the log couldn't write a set or Done
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
  /** The workout's id when the route needs it first (to tell its own open workout from one left over). */
  workoutId?: string;
  onPose?: OnPose;
  video?: VideoOutput;
  record?: boolean;
};

/** One counter per exercise. `step` indexes expanded steps; switching still points to the finished step. */
type Context = Counting & {
  landmarker: PoseLandmarker | null;
  onPose?: OnPose;
  video?: VideoOutput;
  record: boolean;
  /** The camera dropped the video output: nothing more is filmed this session. */
  videoLost: boolean;
  stepS: number;
  stepStartedAt: number | null;
  workoutId: string;
  setId: string;
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
  /** This set's files so far, in order: a pause or resume starts a new one. */
  takes: readonly string[];
  results: readonly StepResult[];
  /** The file being filmed. */
  take: string | null;
  /** Results are safe to read: every file is final (failed ones dropped from their set). */
  final: boolean;
  /** Keep this session's traces and videos on the phone when it stops (the Done screen's switch). */
  share: boolean;
  /** The log saved the workout (Done went through). */
  saved: boolean;
  /** The log threw the workout away (Discard went through). */
  discarded: boolean;
  /** The log's last write failed; it tries the unwritten sets again with the next one. */
  unsaved: boolean;
};

const CAPTION_MS = 3000;
const REP_FLASH_MS = 600;
const NO_REP_FLASH_MS = 1000;
/** Seconds of "get ready" before a set that keeps the phone where it is. */
const COUNTDOWN_S = 3;
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
  sendBack({ type: 'ready', landmarker: instance });
  return () => instance.close();
});

// The route provides the real log (`workoutLog` in log.ts) with the run it counts toward; without one,
// as in most tests, nothing is kept.
const log = fromCallback<LogEvent, LogInput>(() => {});

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
  log: typeof log;
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
    exercise,
    labels: EXERCISES[exercise].kind === 'hold' ? { holdMs: heldMs } : { reps },
  };
}

const without = (takes: readonly string[], uri: string) => takes.filter((take) => take !== uri);

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
  actors: { landmarker, speech, orientation: orientationLock, ticker, camcorder, recorder, log },
  actions: {
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
      if (c.record) enqueue.sendTo('recorder', { type: 'frame', result });
      const { update, live, flash, say } = countFrame(c, result);
      c.onPose?.(result, live);
      enqueue.assign(update);
      if (flash) {
        enqueue.assign({ flash });
        enqueue.cancel('flash');
        const delay = flash === 'rep' ? REP_FLASH_MS : NO_REP_FLASH_MS;
        enqueue.raise({ type: 'flashOff' }, { id: 'flash', delay });
      }
      for (const text of say) enqueue.raise({ type: 'say', text });
    }),
    // The current set (finished or cut short) joins the results and the log; its trace is saved when recording.
    saveSet: enqueueActions(({ context, enqueue }) => {
      const { exercise } = lastExercise(context);
      const { reps, noReps, heldMs } = context[exercise];
      console.info('[session]', exercise, 'set done', { reps, noReps, heldMs });
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
      enqueue.assign({ results: [...context.results, set] });
    }),
    // Back to the start position on the other camera; waits in counting.flipping for it to stream.
    flipSet: enqueueActions(({ context, enqueue }) => {
      enqueue.sendTo('recorder', { type: 'drop' });
      enqueue.assign({
        ...freshSet(),
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
    ...freshSet(),
    workoutId: input.workoutId ?? uuid.v4(),
    landmarker: null,
    onPose: input.onPose,
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
    // shortcut: on by default while we collect test sets, and nothing is uploaded yet; once a backend
    // uploads what is kept, start it off again: sharing is your choice, never a default.
    share: true,
    saved: false,
    discarded: false,
    unsaved: false,
  }),
  invoke: [
    { src: 'landmarker' },
    { src: 'speech', id: 'speech' },
    {
      src: 'orientation',
      id: 'orientation',
      input: ({ context }) => lockFor(context),
    },
    {
      src: 'camcorder',
      id: 'camcorder',
      input: ({ context }) => ({ video: context.video, share: context.share }),
    },
    {
      src: 'recorder',
      id: 'recorder',
      input: ({ context }) => ({ on: context.record, share: context.share }),
    },
    { src: 'log', id: 'log', input: ({ context }) => ({ workoutId: context.workoutId }) },
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
    logFailed: { actions: assign({ unsaved: true }) },
    logSaved: { actions: assign({ saved: true, unsaved: false }) },
    logDiscarded: { actions: assign({ discarded: true }) },
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
          actions: [sendTo('recorder', { type: 'drop' }), assign(() => freshSet())],
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
            assign({ share: ({ event }) => event.share }),
            sendTo('recorder', ({ event }) => ({ type: 'share', on: event.share })),
            sendTo('camcorder', ({ event }) => ({ type: 'share', on: event.share })),
          ],
        },
        save: { guard: ({ context }) => !context.saved, actions: sendTo('log', { type: 'done' }) },
        discard: {
          guard: ({ context }) => !context.saved && !context.discarded,
          actions: sendTo('log', { type: 'discard' }),
        },
        // Only now is every file final (failed ones dropped), so the sets are safe to play.
        wrapped: {
          actions: assign({ final: true }),
        },
      },
    },
  },
});
