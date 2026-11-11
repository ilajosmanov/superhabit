import { Platform } from 'react-native';
import type { PoseDetection, PoseLandmark } from 'superhabit-pose';
import { fromCallback } from 'xstate';

import { COUNTER_VERSIONS, type ExerciseId } from '@/exercises/registry';
import { consentsGiven } from '@/storage/consent';
import {
  traceBuilder,
  type RecordedFrame,
  type TraceHeader,
  type TracePoint,
} from '@/storage/trace-file';

import { sweepTraceWrites, writeTrace } from './recorder-file';
import type { TakeEvent } from './camcorder';

type Stretch = NonNullable<TraceHeader['stretches']>[number];
type Window = { setId: string; exercise: ExerciseId; camera: 'front' | 'back' };
export type RecorderEvent =
  | ({ type: 'stage'; kind: Stretch['kind'] } & Window)
  | { type: 'frame'; result: PoseDetection; phase: string; waiting: string | null }
  | { type: 'save'; counted: TraceHeader['counted'] }
  | TakeEvent;

// shortcut: a window past 9000 frames leaves no trace (its count would describe frames it lacks);
// stream to disk if sets longer than 5 min at 30 fps matter.
const MAX_FRAMES = 9000;

/** One detector result as the set's trace keeps it, `t` ms after the set's first frame. */
function toFrame(
  result: PoseDetection,
  t: number,
  phase: string,
  waiting: string | null,
): RecordedFrame {
  const point = ({ x, y, z, visibility }: PoseLandmark): TracePoint => [x, y, z, visibility];
  return {
    t,
    landmarks: result.landmarks.map(point),
    world: result.worldLandmarks.map(point),
    ...(result.down && { down: [result.down.x, result.down.y, result.down.z] }),
    presence: result.landmarks.map((landmark) => landmark.presence ?? NaN),
    phase,
    waiting,
    inferenceMs: result.inferenceMs,
    brightness: result.brightness,
  };
}

/**
 * Packs each frame from countdown through set end, including waiting and pauses, as it arrives, so the
 * set's end has little left to do; every finished trace stays local.
 */
export const recorder = fromCallback<RecorderEvent, { on: boolean }>(({ input, receive }) => {
  if (!input.on) return;
  sweepTraceWrites();
  let window: Window | null = null;
  let trace = traceBuilder();
  let stretches: Stretch[] = [];
  let takes: TraceHeader['takes'] = [];
  let taking = false;
  let camera: TraceHeader['camera'] = null;
  let delegate: PoseDetection['delegate'] | undefined;
  let lastT = -1;
  let t0: number | null = null;
  /** The window keeps no trace: it ran too long, or a frame couldn't be kept. */
  let lost = false;
  /** The consents in force when the set started: they decide whether its trace may be shared. */
  let consent: string[] = [];
  const drop = () => {
    window = null;
    trace = traceBuilder();
    stretches = [];
    takes = [];
    taking = false;
    camera = null;
    delegate = undefined;
    lastT = -1;
    t0 = null;
    lost = false;
    consent = [];
  };
  const lose = () => {
    lost = true;
    trace = traceBuilder();
  };
  // State events use the latest accepted detector time; a frame's counter change uses that frame's t.
  // Touching endpoints avoid invented time between detector samples, including a frame-free pause.
  const mark = (kind: Stretch['kind'], t = Math.max(0, lastT)) => {
    const previous = stretches.at(-1);
    if (previous) previous.endMs = t;
    if (previous?.kind !== kind) stretches.push({ kind, startMs: t, endMs: t });
  };

  receive((event) => {
    if (event.type === 'stage') {
      if (window?.setId !== event.setId) {
        drop();
        consent = consentsGiven();
      }
      window = event;
      mark(event.kind);
    } else if (event.type === 'takeStart') {
      if (window?.setId !== event.setId) return;
      const t = Math.max(0, lastT);
      takes.push({ startMs: t, endMs: t, videoAnchorMs: null });
      taking = true;
    } else if (event.type === 'takeEnd') {
      if (window?.setId !== event.setId) return;
      const take = takes.at(-1);
      if (take && t0 !== null && event.anchorPoseMs !== null)
        take.videoAnchorMs = event.anchorPoseMs - t0;
      taking = false;
    } else if (event.type === 'frame') {
      if (!window || lost) return;
      const { result, phase, waiting } = event;
      t0 ??= result.timestampMs;
      const t = Math.round(result.timestampMs - t0);
      if (t <= lastT) return;
      if (trace.frames === MAX_FRAMES) {
        console.info('[recorder] set too long to keep a trace');
        lose();
        return;
      }
      const kind = stretches.at(-1)?.kind;
      if (kind === 'waiting' || kind === 'counting')
        mark(phase === 'waiting' ? 'waiting' : 'counting', t);
      else if (kind) mark(kind, t);
      try {
        trace.add(toFrame(result, t, phase, waiting));
      } catch (error) {
        console.warn('[recorder] could not keep a frame; the set keeps no trace', error);
        lose();
        return;
      }
      lastT = t;
      const take = takes.at(-1);
      if (taking && take) take.endMs = t;
      delegate ??= result.delegate;
      camera ??= {
        facing: window.camera,
        fps: null,
        width: result.frameWidth,
        height: result.frameHeight,
        rotation:
          result.rotation === 90 || result.rotation === 180 || result.rotation === 270
            ? result.rotation
            : 0,
        mirrored: window.camera === 'front',
        // shortcut: the detector doesn't report the camera's field of view; add it when calibrated.
        fieldOfView: null,
      };
    } else {
      if (window && trace.frames > 0 && !lost) {
        mark(stretches.at(-1)?.kind ?? 'waiting');
        void writeTrace(
          {
            exercise: window.exercise,
            setId: window.setId,
            counterVersion: COUNTER_VERSIONS[window.exercise],
            device: {
              // RN 0.88's Model is Android-only; no hardware model is exposed by Platform on iOS.
              // shortcut: use unknown on iOS until device-model collection is needed there.
              model: Platform.OS === 'android' ? Platform.constants.Model : 'unknown',
              os: `${Platform.OS} ${Platform.OS === 'android' ? Platform.constants.Release : Platform.Version}`,
              delegate,
            },
            // Frames per second over the set; NaN (one frame) and 0 (a sparse set) are unmeasured.
            camera: camera && {
              ...camera,
              fps: Math.round(((trace.frames - 1) * 1000) / lastT) || null,
            },
            stretches,
            takes,
            consent,
            counted: event.counted,
            labels: {},
          },
          trace,
        );
      }
      drop();
    }
  });
  // Committed file jobs keep their captured buffers; only the unfinished window belongs to teardown.
  return drop;
});
