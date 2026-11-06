import { expect, test } from 'vite-plus/test';

import { NONE, settle } from './framing';

test('the committed reading again changes nothing, and drops a pending candidate', () => {
  expect(settle({ missing: ['feet'], candidate: null }, ['feet'], 500)).toEqual({
    patch: null,
    phrase: null,
  });
  const pending = { missing: ['feet'] as const, candidate: { parts: ['head'] as const, since: 0 } };
  expect(settle(pending, ['feet'], 500).patch).toEqual({ candidate: null });
});

test('a differing reading commits only once it has held 1000 ms', () => {
  const first = settle({ missing: NONE, candidate: null }, ['feet'], 0);
  expect(first).toEqual({ patch: { candidate: { parts: ['feet'], since: 0 } }, phrase: null });
  const candidate = { parts: ['feet'] as const, since: 0 };
  expect(settle({ missing: NONE, candidate }, ['feet'], 999)).toEqual({
    patch: null,
    phrase: null,
  });
  expect(settle({ missing: NONE, candidate }, ['feet'], 1000)).toEqual({
    patch: { missing: ['feet'], candidate: null },
    phrase: 'Your feet are out of frame',
  });
});

test('a new differing reading restarts the wait', () => {
  const candidate = { parts: ['feet'] as const, since: 0 };
  expect(settle({ missing: NONE, candidate }, ['head'], 1500).patch).toEqual({
    candidate: { parts: ['head'], since: 1500 },
  });
});

test('null parts (not waiting) clear at once, silently', () => {
  expect(settle({ missing: ['head'], candidate: null }, null, 0)).toEqual({
    patch: { missing: NONE, candidate: null },
    phrase: null,
  });
});
