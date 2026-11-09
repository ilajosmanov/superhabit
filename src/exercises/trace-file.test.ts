import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { PoseDetection } from 'superhabit-pose';
import { describe, expect, it } from 'vite-plus/test';

import { body } from '@/exercises/__fixtures__/body';
import { replay } from '@/exercises/__fixtures__/replay';
import { toFrame, toPose, type TracePoint } from '@/exercises/body/trace';
import { squat } from '@/exercises/squat';
import { decodeTrace, encodeTrace, type RecordedFrame, type TraceInfo } from './trace-file';

const detection = (
  timestampMs: number,
  shape = { thigh: 70, shin: 25, lean: 10 },
): PoseDetection => ({
  ...body(shape),
  timestampMs,
  cameraLandmarks: [],
});
const replayed = (frames: RecordedFrame[]) => replay(squat, { frames });

const info: TraceInfo = {
  exercise: 'squat',
  setId: 'set-1',
  counterVersion: '1.0.0',
  device: { model: 'Pixel 9', os: 'Android 17' },
  camera: {
    facing: 'front',
    fps: 30,
    width: 480,
    height: 640,
    rotation: 270,
    mirrored: true,
    fieldOfView: 78,
  },
  takes: [{ startMs: 0, endMs: 2000, videoAnchorMs: 412.5 }],
  consent: [],
  counted: { reps: 1, noReps: 0 },
  labels: {},
};
const recorded = (t: number, extra: Partial<RecordedFrame> = {}): RecordedFrame => ({
  ...toFrame(detection(t), 0),
  phase: null,
  waiting: null,
  inferenceMs: null,
  brightness: null,
  ...extra,
});
/** The frame with its nose (joint 0) moved, in the image and in the world. */
const nose = (frame: RecordedFrame, image: TracePoint, world: TracePoint): RecordedFrame => ({
  ...frame,
  landmarks: [image, ...frame.landmarks.slice(1)],
  world: [world, ...frame.world.slice(1)],
});
const roundTrip = (frames: RecordedFrame[]) => decodeTrace(encodeTrace(info, frames));

describe('Trace v2', () => {
  it('keeps every value within half a quantum of its column', () => {
    const frame = nose(
      recorded(0, {
        presence: Array(33).fill(0.55554),
        down: [0.36, 0.8, -0.48],
        phase: 'up',
        inferenceMs: 23.456,
        brightness: 117.333,
      }),
      [0.12345678, -0.0001, 3.1416, 0.987654],
      [0.31416, -1.23456, 0.0000499, 0.987654],
    );
    const { header, frames } = roundTrip([frame]);
    const [decoded] = frames;
    // x 987.65 → 988 / 8000; y −0.8 → −1 / 8000; z 15708 / 5000; visibility 9876.54 → 9877 / 10000.
    expect(decoded.landmarks[0]).toEqual([0.1235, -0.000125, 3.1416, 0.9877]);
    // World points carry the image point's visibility.
    expect(decoded.world[0]).toEqual([0.3142, -1.2346, 0, 0.9877]);
    expect(decoded).toMatchObject({
      t: 0,
      presence: Array(33).fill(0.5555),
      down: [0.36, 0.8, -0.48],
      phase: 'up',
      waiting: null,
      inferenceMs: 23.46,
      brightness: 117.33,
    });
    const half = [0.5 / 8000, 0.5 / 8000, 0.5 / 5000, 0.5 / 10000];
    frame.landmarks.forEach((point, j) =>
      point.forEach((v, k) =>
        expect(Math.abs(decoded.landmarks[j][k] - v)).toBeLessThanOrEqual(half[k] + 1e-12),
      ),
    );
    frame.world.forEach((point, j) =>
      point
        .slice(0, 3)
        .forEach((v, k) =>
          expect(Math.abs(decoded.world[j][k] - v)).toBeLessThanOrEqual(0.5 / 10000 + 1e-12),
        ),
    );
    expect(header).toMatchObject({ ...info, phases: ['up'], waitingReasons: [], frames: 1 });
    expect(header.columns).toHaveLength(272);
  });

  it('keeps a 40 s pause in the frame times', () => {
    const times = [0, 33, 40033, 40066];
    expect(roundTrip(times.map((t) => recorded(t))).frames.map((frame) => frame.t)).toEqual(times);
  });

  it('keeps frames without gravity apart from frames with it', () => {
    const down = [0, 1, 0] as const;
    const { frames } = roundTrip([recorded(0), recorded(33, { down: undefined }), recorded(66)]);
    expect(frames.map((frame) => frame.down)).toEqual([down, undefined, down]);
    expect(toPose(frames[1])).not.toHaveProperty('down');
  });

  it('keeps frames without a person, between values a whole column apart', () => {
    const at = (t: number, x: number) => nose(recorded(t), [x, 0.5, 0, 0.9], [0, 0, 0, 0.9]);
    const empty = recorded(66, { landmarks: [], world: [], down: undefined, waiting: 'no body' });
    // 4 → −4 is a delta of −64000 quanta, beyond int16: it must wrap and still add back.
    const { header, frames } = roundTrip([at(0, 4), at(33, -4), empty, at(99, 4)]);
    expect(header.columns.find((column) => column.name === 'image.nose.x')?.scale).toBe(8000);
    expect(frames.map((frame) => frame.landmarks[0]?.[0])).toEqual([4, -4, undefined, 4]);
    expect(frames[2]).toMatchObject({ landmarks: [], world: [], waiting: 'no body' });
    expect(frames[2]).not.toHaveProperty('down');
    expect(replayed([frames[2]])).toMatchObject({ phase: 'waiting' });
  });

  it('widens a column whose values outgrow its scale instead of clamping them', () => {
    const { header, frames } = roundTrip([
      nose(recorded(0, { inferenceMs: 900 }), [5.2, 0.5, 0, 0.9], [0, 0, 0, 0.9]),
      nose(recorded(33), [-6.1, 0.5, 0, 0.9], [0, 0, 0, 0.9]),
    ]);
    const scale = (name: string) => header.columns.find((column) => column.name === name)?.scale;
    // 6.1 × 8000 > 32767, so 4000; 900 × 100 and × 50 too, so 25.
    expect([scale('image.nose.x'), scale('inferenceMs'), scale('image.nose.y')]).toEqual([
      4000, 25, 8000,
    ]);
    expect(frames.map((frame) => frame.landmarks[0][0])).toEqual([5.2, -6.1]);
    expect(frames[0].inferenceMs).toBe(900);
  });

  it('replays a decoded set like the frames it was made from', () => {
    // Standing, a squat's bottom for 25 frames, standing again: one rep.
    const frames = Array.from({ length: 75 }, (_, i) =>
      recorded(
        i * 66,
        toFrame(
          detection(
            i * 66,
            i >= 25 && i < 50 ? { thigh: 70, shin: 25, lean: 0 } : { thigh: 0, shin: 0, lean: 0 },
          ),
          0,
        ),
      ),
    );
    expect(replayed(roundTrip(frames).frames)).toMatchObject({ reps: 1, phase: 'up' });
  });

  it('drops only the glitched frame when the detector returns NaN', () => {
    const point = nose(recorded(33), [NaN, 0.5, 0, 0.9], [0, 0, 0, 0.9]);
    const extras = recorded(66, {
      down: [NaN, 1, 0],
      presence: [NaN, ...Array<number>(32).fill(0.9)],
    });
    const { frames } = roundTrip([recorded(0), point, extras, recorded(99)]);
    expect(frames.map((frame) => frame.t)).toEqual([0, 33, 66, 99]);
    expect(frames.map((frame) => frame.landmarks.length)).toEqual([33, 0, 33, 33]);
    expect(frames.map((frame) => frame.world.length)).toEqual([33, 0, 33, 33]);
    expect(frames.map((frame) => frame.down)).toEqual([[0, 1, 0], [0, 1, 0], undefined, [0, 1, 0]]);
    expect(frames[2]).not.toHaveProperty('presence');
  });

  it('keeps a clip converted from a public dataset, recorded without device or camera notes', () => {
    const legacy: TraceInfo = {
      ...info,
      source: {
        dataset: 'fitness-aqa',
        clip: 'squat-12',
        url: 'https://example.org/squat-12',
        license: 'CC BY 4.0',
      },
      device: null,
      camera: null,
      takes: [],
      counted: { reps: 3 },
    };
    expect(decodeTrace(encodeTrace(legacy, [recorded(0)])).header).toMatchObject(legacy);
  });

  /** Rebuilds a file around an edited header, optionally cutting bytes off its end. */
  const repack = (file: Uint8Array, edit: (header: Record<string, unknown>) => void, cut = 0) => {
    const raw = gunzipSync(file);
    const end = 8 + new DataView(raw.buffer, raw.byteOffset).getUint32(4, true);
    const header = JSON.parse(strFromU8(raw.subarray(8, end)));
    edit(header);
    const json = strToU8(JSON.stringify(header));
    const rest = raw.subarray(end, raw.length - cut);
    const out = new Uint8Array(8 + json.length + rest.length);
    out.set(raw.subarray(0, 4));
    new DataView(out.buffer).setUint32(4, json.length, true);
    out.set(json, 8);
    out.set(rest, 8 + json.length);
    return gzipSync(out);
  };
  const file = () => encodeTrace(info, [recorded(0, { phase: 'up' }), recorded(33)]);
  const bad: [string, () => Uint8Array, string][] = [
    ['not gzip', () => strToU8('{"version":1}'), 'gzip'],
    ['a cut-off download', () => file().subarray(0, 200), 'trace'],
    ['another format', () => gzipSync(strToU8('SHT1 and then some')), 'magic'],
    ['missing frame bytes', () => repack(file(), () => {}, 2), 'frames need'],
    [
      'a header claiming more frames',
      () => repack(file(), (h) => (h.frames = 3), 0),
      'frames need',
    ],
    [
      'two column names merged into one',
      () =>
        repack(file(), (h) => {
          if (!Array.isArray(h.columns)) return;
          // inferenceMs and brightness, the last two: their names still join to the same text.
          const [last] = h.columns.splice(-1);
          h.columns[h.columns.length - 1].name += `,${last.name}`;
        }),
      'columns',
    ],
    [
      'a take that ends before it starts',
      () => repack(file(), (h) => (h.takes = [{ startMs: 2000, endMs: 1000, videoAnchorMs: 0 }])),
      'takes',
    ],
    ['a header without a set id', () => repack(file(), (h) => delete h.setId), 'setId'],
    ['a phase the header does not list', () => repack(file(), (h) => (h.phases = [])), 'phase'],
  ];

  it('reads back a file rebuilt unchanged, so the cases below fail for their own reason', () => {
    expect(decodeTrace(repack(file(), () => {})).frames).toHaveLength(2);
  });

  it.each(bad)('rejects %s with a clear error', (_, make, message) => {
    expect(() => decodeTrace(make())).toThrow(message);
  });

  it('keeps a minute of 30 fps movement under 0.6 MB', () => {
    let seed = 1;
    const noise = (size: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return (seed / 2 ** 31 - 0.5) * 2 * size;
    };
    // Squats every 2 s with detector jitter about the size of a phone's (tens of quanta a frame).
    const frames = Array.from({ length: 1800 }, (_, i): RecordedFrame => {
      const t = Math.round((i * 1000) / 30);
      const s = Math.sin((t / 1000) * Math.PI);
      const pose = body({ thigh: 35 + 35 * s, shin: 12 + 12 * s, lean: 10 });
      const world = pose.worldLandmarks.map(({ x, y, z }, j) => [
        x + j / 100 + noise(0.006),
        y + noise(0.006),
        z + noise(0.006),
      ]);
      return {
        t,
        landmarks: world.map(([x, y, z]) => [
          0.5 + x / 2 + noise(0.004),
          0.5 + y / 2 + noise(0.004),
          z * 2 + noise(0.015),
          0.9 + noise(0.001),
        ]),
        world: world.map(([x, y, z]) => [x, y, z, 0.9]),
        presence: world.map(() => 0.99 + noise(0.001)),
        down: [noise(0.002), 1, noise(0.002)],
        phase: s > 0 ? 'down' : 'up',
        waiting: null,
        inferenceMs: 25 + noise(5),
        brightness: 120 + noise(2),
      };
    });
    const size = encodeTrace(info, frames).length;
    expect(size).toBeLessThan(600_000);
  });
});
