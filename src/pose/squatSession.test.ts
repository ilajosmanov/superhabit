import { describe, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';

const close = vi.fn();
vi.mock('superhabit-pose', () => ({ createPoseLandmarker: () => ({ close }) }));
vi.mock('expo-speech', () => ({ speak: vi.fn(), stop: vi.fn() }));

const { squatSession } = await import('./squatSession');

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
});
