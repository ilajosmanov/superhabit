import { expect, it } from 'vite-plus/test';

import { repAt } from './rep-loop';

it('goes out, holds, comes back and holds once a period', () => {
  expect(repAt(0, 1000)).toBe(0);
  expect(repAt(200, 1000)).toBeCloseTo(0.5);
  expect(repAt(450, 1000)).toBe(1);
  expect(repAt(700, 1000)).toBeCloseTo(0.5);
  expect(repAt(950, 1000)).toBe(0);
  expect(repAt(1450, 1000)).toBe(1);
});
