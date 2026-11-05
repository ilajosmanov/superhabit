import { describe, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';

import type { Pose } from './squat';
import { body } from './__fixtures__/body';

const close = vi.fn();
const speak = vi.fn();
vi.mock('superhabit-pose', () => ({ createPoseLandmarker: () => ({ close }) }));
vi.mock('expo-speech', () => ({ speak, stop: vi.fn() }));

const { squatSession } = await import('./squatSession');

const detection = ({ image, world }: Pose, timestampMs: number) => ({
  timestampMs,
  landmarks: image,
  worldLandmarks: world,
  cameraLandmarks: [],
});

describe('squatSession', () => {
  it('opens the detector on start and closes it on stop', () => {
    const actor = createActor(squatSession).start();
    expect(actor.getSnapshot().context.landmarker).toMatchObject({ close });
    actor.stop();
    expect(close).toHaveBeenCalledOnce();
  });

  it('steps the counter on each result and resets', () => {
    const actor = createActor(squatSession).start();
    const result = { timestampMs: 1, landmarks: [], worldLandmarks: [], cameraLandmarks: [] };
    actor.send({ type: 'pose', result });
    expect(actor.getSnapshot().context.squat).toMatchObject({ reps: 0, phase: 'waiting' });
    actor.send({ type: 'reset' });
    expect(actor.getSnapshot().context.squat.reps).toBe(0);
    actor.stop();
  });

  it('says the count when a rep lands', () => {
    const actor = createActor(squatSession).start();
    const spans: [Pose, number, number][] = [
      [body({}), 0, 2000],
      [body({ thigh: 70, shin: 25 }), 2066, 3500],
      [body({}), 3566, 5000],
    ];
    for (const [pose, from, to] of spans)
      for (let t = from; t <= to; t += 66) actor.send({ type: 'pose', result: detection(pose, t) });
    expect(actor.getSnapshot().context.squat.reps).toBe(1);
    expect(speak).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith('1', expect.anything());
    actor.stop();
  });
});
