import { expect, it } from 'vite-plus/test';

import { smooth, type Smooth } from './smooth';

const run = (samples: [value: number, tSec?: number][]) => {
  let s: Smooth | undefined;
  return samples.map(([value, t]) => (s = smooth(s, value, t)).x);
};

// Reference outputs from the 1eurofilter package (new OneEuroFilter(15, 1, 0.01)).
it('matches the reference 1€ filter, with and without timestamps', () => {
  expect(
    run([[170, 0], [170, 0.066], [100, 0.132], [100, 0.198], [100, 0.264], [140], [140, 0.4]]),
  ).toEqual([
    170, 170, 125.88805474269381, 109.23638773844748, 103.59947064509899, 116.63815593286577,
    126.60124622479975,
  ]);
  expect(run([[170], [100], [100]])).toEqual([170, 125.76070609555995, 109.1615366411825]);
});

it('never mutates the previous state', () => {
  const first = smooth(undefined, 170, 0);
  const copy = { ...first };
  smooth(first, 100, 0.066);
  expect(first).toEqual(copy);
});
