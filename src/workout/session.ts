import * as ScreenOrientation from 'expo-screen-orientation';
import { createPoseLandmarker, type PoseDetection, type PoseLandmarker } from 'superhabit-pose';
import { assign, enqueueActions, fromCallback, sendTo, setup, type SnapshotFrom } from 'xstate';

import { expire } from '@/exercises/rep-counter';
import { framePhrase, repPhrase, setPhrase, startPhrase } from './phrase';
import { speech } from './speech';

import {
  EXERCISES,
  initialCounters,
  outOfFrame,
  type BodyPart,
  type Counters,
  type Exercise,
  type ExerciseId,
  type Pose,
  type Tally,
} from '@/exercises/registry';

import { bestRep, clipTime, type Attempt, type BestRep, type SetResult } from './results';
import { camcorder, type VideoOutput } from './camcorder';
import type { Challenge } from './challenges';

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
  | { type: 'next' } // counting: end the set now; switching: the phone is in place, start the next set
  | { type: 'pause' } // counting
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
type Input = { challenge: Challenge; onPose?: OnPose; video?: VideoOutput };
type Orientation = Exercise<Tally>['orientation'];

/** One counter per exercise at the top level. `set` indexes `challenge.sets`; during switching it is still the finished set. */
type Context = Counters & {
  landmarker: PoseLandmarker | null;
  onPose?: OnPose;
  video?: VideoOutput;
  challenge: Challenge;
  set: number;
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
  results: readonly SetResult[];
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
const orientation = fromCallback<LockEvent, Orientation>(({ input, receive }) => {
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
  orientation: typeof orientation;
  ticker: typeof ticker;
  camcorder: typeof camcorder;
};

const current = (c: Context) => c.challenge.sets[c.set];
const orientationOf = (c: Context) => EXERCISES[current(c).exercise].orientation;
const isLast = (c: Context) => c.set === c.challenge.sets.length - 1;
const flip = (c: Context) => (c.camera === 'front' ? 'back' : 'front');

/** Steps only `id`'s counter. Generic K keeps EXERCISES[id] and c[id] correlated without assertions. */
function stepCounter<K extends ExerciseId>(c: Counters, id: K, pose: Pose, nowMs: number) {
  const exercise = EXERCISES[id];
  const sample = exercise.measure(pose);
  const next = exercise.step(c[id], sample, nowMs);
  const patch: Partial<Counters> = {};
  patch[id] = next;
  const live: Live = {
    angle: sample && next.filter ? next.filter.x : null,
    lowest: next.phase === 'waiting' || next.min >= 180 ? null : next.min,
    joints: sample?.joints ?? null,
  };
  return { next, patch, live };
}

/** Drops only `id`'s attempt in progress, so the next count needs the start position again. */
function expireCounter<K extends ExerciseId>(c: Counters, id: K) {
  const patch: Partial<Counters> = {};
  patch[id] = expire(c[id], Infinity);
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
function withSet(c: Context): readonly SetResult[] {
  const { exercise: id, reps: target } = current(c);
  const { reps, noReps }: Tally = c[id];
  const { name, gauge } = EXERCISES[id];
  const set = { name, down: gauge.down, target, reps, noReps, attempts: c.attempts };
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
export function settle(
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
 *   counting --(target reached | next)--> ending --(last set)--> finished
 *      ^ |                                      \--> switching --next--> counting (set + 1)
 *      | pause
 *   paused --resume | restart | flipCamera--> counting;  end: counting | paused | switching --> finished
 *
 * Only `counting` steps a counter; paused, switching and finished only hand frames to the screen.
 * Everything said goes through `say`, so the caption is set even when muted.
 * finished is not `type: 'final'`: a final root state would stop speech and cut "Challenge done".
 */
// Positional generics up to TInput (no type assertions allowed): children, actions, guards, delays, tags.
export const workoutSession = setup<Context, Events, Actors, {}, {}, {}, never, string, Input>({
  actors: { landmarker, speech, orientation, ticker, camcorder },
}).createMachine({
  context: ({ input }) => ({
    ...FRESH_SET,
    landmarker: null,
    onPose: input.onPose,
    video: input.video,
    challenge: input.challenge,
    set: 0,
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
    { src: 'orientation', id: 'orientation', input: ({ context }) => orientationOf(context) },
    { src: 'camcorder', id: 'camcorder', input: ({ context }) => context.video },
  ],
  on: {
    ready: { actions: assign({ landmarker: ({ event }) => event.landmarker }) },
    pose: { actions: ({ context, event }) => context.onPose?.(event.result, NOT_LIVE) },
    tick: { actions: assign({ elapsedS: ({ context }) => context.elapsedS + 1 }) },
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
                event.type === 'pose' && context[current(context).exercise].phase !== 'waiting',
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
            const t = result.timestampMs;
            const { exercise: id, reps: target } = current(c);
            const prev: Tally = c[id];
            const { next, patch, live } = stepCounter(c, id, result, t);
            c.onPose?.(result, live);
            enqueue.assign(patch);

            const { take } = c;
            if (take && take.startMs === null) enqueue.assign({ take: { ...take, startMs: t } });

            const rep = next.lastRep;
            if (rep && (next.reps > prev.reps || next.noReps > prev.noReps)) {
              const { counted, depth } = rep;
              const attempt: Attempt = { counted, depth, cue: rep.cues[0] ?? null };
              // Only a bottom filmed by the live take: not before it started, and `taken` clears it once it ends.
              const atMs = take && take.startMs !== null ? clipTime(take.startMs, t, rep.upMs) : -1;
              enqueue.assign({
                attempts: [
                  ...c.attempts,
                  take && atMs >= 0 ? { ...attempt, clip: { uri: take.uri, atMs } } : attempt,
                ],
                flash: counted ? 'rep' : 'noRep',
              });
              enqueue.cancel('flash');
              const delay = counted ? REP_FLASH_MS : NO_REP_FLASH_MS;
              enqueue.raise({ type: 'flashOff' }, { id: 'flash', delay });
            }
            // The set's last rep is announced by `ending` instead; "Go" only before the set's first attempt.
            const text =
              (next.reps < target ? repPhrase(prev, next, rep?.cues) : null) ??
              (c.attempts.length ? null : startPhrase(prev.phase, next.phase));
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
          actions: assign(({ context }) => ({
            ...FRESH_SET,
            camera: flip(context),
            flipPending: true,
          })),
        },
        end: {
          target: 'finished',
          actions: assign({ results: ({ context }) => withSet(context) }),
        },
      },
      always: {
        guard: ({ context }) => context[current(context).exercise].reps >= current(context).reps,
        target: 'ending',
      },
    },
    // Detector frames keep arriving (root `pose`) but nothing counts, so resuming needs the start position again.
    paused: {
      entry: assign(({ context }) => expireCounter(context, current(context).exercise)),
      on: {
        resume: 'counting',
        restart: { target: 'counting', actions: assign(FRESH_SET) },
        // Earlier sets stay; the take was already cut on entering paused.
        flipCamera: {
          target: 'counting.flipping',
          actions: assign(({ context }) => ({
            ...FRESH_SET,
            camera: flip(context),
            flipPending: true,
          })),
        },
        end: {
          target: 'finished',
          actions: assign({ results: ({ context }) => withSet(context) }),
        },
      },
    },
    ending: {
      entry: enqueueActions(({ context, enqueue }) => {
        enqueue.assign({ results: withSet(context) });
        const { reps } = context[current(context).exercise];
        const next = context.challenge.sets[context.set + 1];
        const text = setPhrase(
          reps,
          next ? { ...EXERCISES[next.exercise], reps: next.reps } : null,
        );
        enqueue.raise({ type: 'say', text });
      }),
      always: [
        { guard: ({ context }) => isLast(context), target: 'finished' },
        { target: 'switching' },
      ],
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
            assign(({ context }) => ({ ...FRESH_SET, set: context.set + 1 })),
            sendTo('orientation', ({ context }) => ({
              type: 'lock',
              orientation: orientationOf(context),
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
  const { exercise: id, reps: target } = current(c);
  const tally: Tally = c[id];
  const after = c.challenge.sets[c.set + 1];
  // Annotated: an inferred literal would widen to string in the returned object.
  const stage: 'counting' | 'paused' | 'switching' | 'finished' = snapshot.matches('switching')
    ? 'switching'
    : snapshot.matches('finished')
      ? 'finished'
      : snapshot.matches('paused')
        ? 'paused'
        : 'counting';
  // Annotated to hide the per-exercise counter types.
  const next: Omit<Exercise<Tally>, 'initial' | 'measure' | 'step' | 'stats'> | null = after
    ? EXERCISES[after.exercise]
    : null;
  return {
    stage,
    /** The current set's exercise; in switching and finished, the set just done. */
    exercise: id,
    name: EXERCISES[id].name,
    /** Infinity = open-ended. */
    target,
    reps: tally.reps,
    phase: tally.phase,
    /** This set has an attempt (rep or no-rep); from then on 'waiting' means lost, not set-up. */
    started: c.attempts.length > 0,
    /** 1-based. */
    set: c.set + 1,
    sets: c.challenge.sets.length,
    /** The set after this one (stable references, for shallowEqual). */
    next,
    nextReps: after ? after.reps : 0,
    /** Whole seconds; ticks while counting or switching, not paused or finished. */
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
