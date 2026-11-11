import { encodeTrace, type TraceInfo } from '../../../src/storage/trace-file';

/** A real `.sht` file of one frame, from the phone's own encoder; `consents` as in force at capture. */
export const trace = (setId: string, consents = ['traces@1']) => {
  const info: TraceInfo = {
    exercise: 'squat',
    setId,
    counterVersion: '1.0.0',
    device: { model: 'Pixel 9', os: 'Android 17' },
    camera: null,
    takes: [],
    consent: consents,
    counted: { reps: 1 },
    labels: {},
  };
  return encodeTrace(info, [
    {
      t: 0,
      landmarks: Array.from({ length: 33 }, (_, j) => [0.3 + j / 100, 0.5, 0, 0.9] as const),
      world: Array.from({ length: 33 }, (_, j) => [j / 100, 0, 0, 0.9] as const),
      down: [0, 1, 0],
      phase: null,
      waiting: null,
      inferenceMs: null,
      brightness: null,
    },
  ]);
};
