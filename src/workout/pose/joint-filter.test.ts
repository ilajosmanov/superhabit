import type { SkPoint } from '@shopify/react-native-skia';
import { expect, it } from 'vite-plus/test';

import { filterJoints, type JointFilter } from './joint-filter';

const DIAG = 1000;
const HZ = 30;

/** Feeds one joint's samples at HZ, returning its filtered points. */
const run = (samples: (SkPoint | null)[]) => {
  let state: JointFilter | null = null;
  return samples.map((p, i) => {
    const out = filterJoints(state, [p], i / HZ, DIAG);
    state = out.state;
    return out.points[0];
  });
};
/** The filtered y (or x) of a sample that must be present. */
const y = (p: SkPoint | null | undefined) => p?.y ?? NaN;
const x = (p: SkPoint | null | undefined) => p?.x ?? NaN;

it('damps jitter around a still joint', () => {
  const out = run(Array.from({ length: 60 }, (_, i) => ({ x: 100 + (i % 2 ? 4 : -4), y: 200 })));
  for (const p of out.slice(20)) expect(Math.abs(x(p) - 100)).toBeLessThan(1);
});

it('follows a steady move within a few frames', () => {
  const still = Array.from({ length: 10 }, () => ({ x: 100, y: 200 }));
  const move = Array.from({ length: 10 }, (_, i) => 200 + 20 * (i + 1)); // 600 px/s
  const out = run([...still, ...move.map((my) => ({ x: 100, y: my }))]).slice(10);
  for (const [i, my] of move.entries()) expect(my - y(out[i])).toBeLessThan(10);
  expect(400 - y(out[9])).toBeLessThan(4);
});

it('holds a brief dropout, then drops the joint and restarts it unfiltered', () => {
  const p = { x: 100, y: 200 };
  const out = run([p, p, null, null, null, null, null, { x: 300, y: 400 }]);
  expect(out[2]).toEqual(p); // 33 ms gap: held
  expect(out[4]).toEqual(p); // 100 ms: held
  expect(out[6]).toBeNull(); // 167 ms: dropped
  expect(out[7]).toEqual({ x: 300, y: 400 }); // a fresh filter starts at the sample
});

it('snaps to a point that jumps past a quarter of the diagonal', () => {
  const out = run([
    { x: 100, y: 100 },
    { x: 100, y: 100 },
    { x: 400, y: 100 },
  ]);
  expect(out[2]).toEqual({ x: 400, y: 100 });
});

it('smooths a jump under the threshold', () => {
  const out = run([
    { x: 100, y: 100 },
    { x: 100, y: 100 },
    { x: 300, y: 100 },
  ]);
  expect(x(out[2])).toBeLessThan(300);
});

it('never mutates the previous state', () => {
  const first = filterJoints(null, [{ x: 1, y: 2 }, null], 0, DIAG).state;
  const copy = structuredClone(first);
  filterJoints(
    first,
    [
      { x: 5, y: 6 },
      { x: 1, y: 1 },
    ],
    1 / HZ,
    DIAG,
  );
  expect(first).toEqual(copy);
});
