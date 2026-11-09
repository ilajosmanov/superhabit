import type { PoseDetection } from 'superhabit-pose';
import { describe, expect, it } from 'vite-plus/test';

import { body, detection } from '@/exercises/__fixtures__/body';
import { replay, traceFiles } from '@/exercises/__fixtures__/replay';
import { squat } from '@/exercises/squat';
import { toFrame, toPose, type TraceFrame } from './trace';

const pose = body({ thigh: 70, shin: 25, lean: 10 });
const detected = (timestampMs: number): PoseDetection => detection(pose, timestampMs);

describe('trace frames', () => {
  it('stores time relative to clip start and gives back the detector pose', () => {
    const frames = [toFrame(detected(1000), 1000), toFrame(detected(1066), 1000)];
    expect(frames.map((frame) => frame.t)).toEqual([0, 66]);
    for (const frame of frames) expect(toPose(frame)).toEqual(pose);
  });

  it('keeps gravity when the phone gave it', () => {
    // Distinct components, so a swapped or flipped axis can't round-trip unnoticed.
    const down = { x: 0.36, y: 0.8, z: -0.48 };
    expect(toPose(toFrame({ ...detected(1000), down }, 1000))).toEqual({ ...pose, down });
  });

  it('replays empty detections as tracking loss, leaving a fresh counter waiting', () => {
    const empty = { frames: [0, 66, 132].map((t) => ({ t, landmarks: [], world: [] })) };
    expect(replay(squat, empty)).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 0,
    });
  });

  const oneRep = () => ({
    frames: Array.from({ length: 75 }, (_, i) =>
      toFrame(
        {
          ...detected(i * 66),
          ...body(i >= 25 && i < 50 ? { thigh: 70, shin: 25 } : {}),
        },
        0,
      ),
    ),
  });

  it('replays a full rep and expires an unfinished attempt using detector time', () => {
    const full = oneRep();
    expect(replay(squat, full)).toMatchObject({ reps: 1, noReps: 0, phase: 'up' });
    // The first half contains standing and the bottom. Lose tracking before the ascent.
    const lost: { frames: TraceFrame[] } = {
      frames: [
        ...full.frames.slice(0, 50),
        { t: 4000, landmarks: [], world: [] },
        { t: 4235, landmarks: [], world: [] },
      ],
    };
    expect(replay(squat, { frames: full.frames.slice(0, 50) })).toMatchObject({
      reps: 0,
      phase: 'down',
    });
    // No valid frame has returned: the null samples themselves must expire the attempt.
    expect(replay(squat, lost)).toMatchObject({ reps: 0, noReps: 0, phase: 'waiting' });
    const interrupted = {
      frames: [
        ...lost.frames,
        ...full.frames.slice(50).map((frame) => ({ ...frame, t: frame.t + 1000 })),
      ],
    };
    expect(replay(squat, interrupted)).toMatchObject({ reps: 0, noReps: 0, phase: 'up' });
  });

  it('returns no files for an exercise without local traces', () => {
    expect(traceFiles('missing-synthetic-exercise')).toEqual([]);
  });
});
