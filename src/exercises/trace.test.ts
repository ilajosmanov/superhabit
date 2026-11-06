import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PoseDetection } from 'superhabit-pose';
import { describe, expect, it } from 'vite-plus/test';

import { body } from './__fixtures__/body';
import { loadTrace, replay, scoreHold, scoreReps, traceFiles } from './__fixtures__/replay';
import { initialSquat, measure, stepSquat } from './squat';
import type { Progress } from './progress';
import { parseTrace, toFrame, toPose, type Trace } from './trace';

const pose = body({ thigh: 70, shin: 25, lean: 10 });
const detection = (timestampMs: number): PoseDetection => ({
  ...pose,
  timestampMs,
  cameraLandmarks: [],
});
const trace = (): Trace => ({
  version: 1,
  source: { dataset: 'synthetic', clip: 'squat', url: '', license: 'test fixture' },
  exercise: 'squat',
  labels: { reps: 0 },
  fps: 15,
  frames: [toFrame(detection(1000), 1000), toFrame(detection(1066), 1000)],
});

describe('Trace v1', () => {
  it('round-trips detector landmarks and stores time relative to clip start', () => {
    const parsed = parseTrace(JSON.parse(JSON.stringify(trace())));
    expect(parsed.frames.map((frame) => frame.t)).toEqual([0, 66]);
    for (const frame of parsed.frames) {
      expect(frame.landmarks).toHaveLength(33);
      expect(frame.world).toHaveLength(33);
      expect([...frame.landmarks, ...frame.world].every((point) => point.length === 4)).toBe(true);
      expect(frame.landmarks[0]).toEqual([0.5, 0.5, 0, 0.9]);
      expect(toPose(frame)).toEqual(pose);
    }
  });

  it('accepts extractor metadata and optional hold labels', () => {
    const raw = trace();
    expect(parseTrace({ ...raw, source: { ...raw.source, view: 'front' } }).source).toMatchObject({
      dataset: 'synthetic',
      clip: 'squat',
    });
    expect(parseTrace({ ...raw, labels: { holdMs: 1500, inShape: true } }).labels).toEqual({
      holdMs: 1500,
      inShape: true,
    });
    expect(parseTrace({ ...raw, labels: {} }).labels).toEqual({});
  });

  const invalid: [string, (raw: Trace) => unknown, string][] = [
    ['version 2', (raw) => ({ ...raw, version: 2 }), 'version'],
    [
      '32 landmarks',
      (raw) => ({
        ...raw,
        frames: [{ ...raw.frames[0], landmarks: raw.frames[0].landmarks.slice(1) }],
      }),
      'frames[0].landmarks',
    ],
    [
      'only world points',
      (raw) => ({ ...raw, frames: [{ ...raw.frames[0], landmarks: [] }] }),
      'frames[0].world',
    ],
    [
      'only image points',
      (raw) => ({ ...raw, frames: [{ ...raw.frames[0], world: [] }] }),
      'frames[0].world',
    ],
    [
      'decreasing timestamps',
      (raw) => ({ ...raw, frames: [...raw.frames, { ...raw.frames[1], t: 33 }] }),
      'frames[2].t',
    ],
    [
      'duplicate timestamps',
      (raw) => ({ ...raw, frames: [raw.frames[0], raw.frames[0]] }),
      'frames[1].t',
    ],
    [
      'nonzero clip start',
      (raw) => ({ ...raw, frames: [{ ...raw.frames[0], t: 1 }] }),
      'frames[0].t',
    ],
    [
      'negative timestamp',
      (raw) => ({ ...raw, frames: [{ ...raw.frames[0], t: -1 }] }),
      'frames[0].t',
    ],
    [
      'nonfinite timestamp',
      (raw) => ({ ...raw, frames: [raw.frames[0], { ...raw.frames[1], t: Infinity }] }),
      'frames[1].t',
    ],
    ...[null, NaN, Infinity, -Infinity].map(
      (coordinate): [string, (raw: Trace) => unknown, string] => [
        `invalid coordinate ${coordinate}`,
        (raw) => ({
          ...raw,
          frames: [{ ...raw.frames[0], landmarks: Array(33).fill([0, 0, coordinate, 1]) }],
        }),
        'frames[0].landmarks[0][2]',
      ],
    ),
    [
      'three-coordinate world point',
      (raw) => ({ ...raw, frames: [{ ...raw.frames[0], world: Array(33).fill([0, 0, 0]) }] }),
      'frames[0].world[0]',
    ],
    [
      'five-coordinate point',
      (raw) => ({
        ...raw,
        frames: [{ ...raw.frames[0], landmarks: Array(33).fill([0, 0, 0, 1, 2]) }],
      }),
      'frames[0].landmarks[0]',
    ],
    ['negative rep label', (raw) => ({ ...raw, labels: { reps: -1 } }), 'labels.reps'],
    ['fractional rep label', (raw) => ({ ...raw, labels: { reps: 1.5 } }), 'labels.reps'],
    ['negative hold label', (raw) => ({ ...raw, labels: { holdMs: -1 } }), 'labels.holdMs'],
    ['nonboolean shape label', (raw) => ({ ...raw, labels: { inShape: 1 } }), 'labels.inShape'],
    ['zero fps', (raw) => ({ ...raw, fps: 0 }), 'fps'],
    ['nonfinite fps', (raw) => ({ ...raw, fps: NaN }), 'fps'],
    [
      'missing license',
      (raw) => ({ ...raw, source: { ...raw.source, license: undefined } }),
      'source.license',
    ],
    ['missing frames', (raw) => ({ ...raw, frames: null }), 'frames'],
  ];

  it.each(invalid)('rejects %s with the field path', (_, corrupt, path) => {
    expect(() => parseTrace(corrupt(trace()))).toThrow(path);
  });

  it('rejects a non-object document', () => {
    expect(() => parseTrace(null)).toThrow('trace');
  });

  it('replays empty detections as tracking loss, leaving a fresh counter waiting', () => {
    const empty = parseTrace({
      ...trace(),
      frames: [0, 66, 132].map((t) => ({ t, landmarks: [], world: [] })),
    });
    expect(replay({ initial: initialSquat, step: stepSquat, measure }, empty)).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 0,
    });
  });

  const squat = { initial: initialSquat, step: stepSquat, measure };
  const oneRep = (): Trace => ({
    ...trace(),
    labels: { reps: 2 },
    frames: Array.from({ length: 75 }, (_, i) =>
      toFrame(
        {
          ...detection(i * 66),
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
    const lost: Trace = {
      ...full,
      frames: [
        ...full.frames.slice(0, 50),
        { t: 4000, landmarks: [], world: [] },
        { t: 4235, landmarks: [], world: [] },
      ],
    };
    expect(replay(squat, { ...full, frames: full.frames.slice(0, 50) })).toMatchObject({
      reps: 0,
      phase: 'down',
    });
    // No valid frame has returned: the null samples themselves must expire the attempt.
    expect(replay(squat, lost)).toMatchObject({ reps: 0, noReps: 0, phase: 'waiting' });
    const interrupted: Trace = {
      ...lost,
      frames: [
        ...lost.frames,
        ...full.frames.slice(50).map((frame) => ({ ...frame, t: frame.t + 1000 })),
      ],
    };
    expect(replay(squat, interrupted)).toMatchObject({ reps: 0, noReps: 0, phase: 'up' });
  });

  it('loads traces lazily and scores only labelled clips, including zero, at the tolerance boundary', () => {
    const directory = mkdtempSync(join(tmpdir(), 'superhabit-trace-'));
    try {
      const labelled = join(directory, 'labelled.json');
      const unknown = join(directory, 'unknown.json');
      const zero = join(directory, 'zero.json');
      const malformed = join(directory, 'malformed.json');
      writeFileSync(labelled, JSON.stringify(oneRep()));
      writeFileSync(unknown, JSON.stringify({ ...oneRep(), labels: {} }));
      writeFileSync(zero, JSON.stringify({ ...trace(), frames: [] }));
      writeFileSync(malformed, JSON.stringify({ ...trace(), version: 2 }));
      const files = [labelled, unknown, zero];
      expect(scoreReps(squat, files, 1)).toEqual([
        { clip: 'squat', expected: 2, got: 1, ok: true },
        { clip: 'squat', expected: 0, got: 0, ok: true },
      ]);
      expect(scoreReps(squat, files, 0)[0].ok).toBe(false);
      expect(() => loadTrace(malformed)).toThrow('version');
      expect(() => scoreReps(squat, [malformed], 1)).toThrow('version');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns no files for an exercise without local traces', () => {
    expect(traceFiles('missing-synthetic-exercise')).toEqual([]);
  });
});

describe('scoreHold', () => {
  // Supply a fixed counter result to isolate scoring from the future hold reducer.
  const counter = (heldMs: number) => ({
    initial: {
      reps: 0,
      noReps: 0,
      heldMs,
      phase: 'waiting',
      broken: false,
      lastRep: null,
    } satisfies Progress,
    step: (state: Progress) => state,
    measure: () => null,
  });
  const score = (labels: Trace['labels'], heldMs: number, ratio = 0.7, toleranceMs = 100) => {
    const directory = mkdtempSync(join(tmpdir(), 'superhabit-hold-score-'));
    try {
      const path = join(directory, 'clip.json');
      writeFileSync(
        path,
        JSON.stringify({
          ...trace(),
          labels,
          frames: [0, 1000].map((t) => toFrame(detection(t), 0)),
        }),
      );
      return scoreHold(counter(heldMs), [path], ratio, toleranceMs);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  it.each([{}, { reps: 1 }, { inShape: false }])(
    'skips clips without a hold label: %j',
    (labels) => {
      expect(score(labels, 700)).toEqual([]);
    },
  );

  it('accepts exactly the in-shape duration ratio and rejects one millisecond below it', () => {
    expect(score({ inShape: true }, 700)).toEqual([
      { clip: 'squat', expected: 1000, got: 700, ok: true },
    ]);
    expect(score({ inShape: true }, 699)[0].ok).toBe(false);
  });

  it.each([900, 1100])('includes the absolute tolerance boundary at %i ms', (heldMs) => {
    expect(score({ holdMs: 1000 }, heldMs)[0].ok).toBe(true);
  });

  it.each([899, 1101])('rejects results outside the absolute tolerance at %i ms', (heldMs) => {
    expect(score({ holdMs: 1000 }, heldMs)[0].ok).toBe(false);
  });

  it('scores a zero hold label and uses timed labels in preference to inShape', () => {
    expect(score({ holdMs: 0, inShape: true }, 100)).toEqual([
      { clip: 'squat', expected: 0, got: 100, ok: true },
    ]);
    expect(score({ holdMs: 0 }, 101)[0].ok).toBe(false);
    expect(score({ holdMs: 0 }, 0, 0.7, 0)[0].ok).toBe(true);
  });
});
