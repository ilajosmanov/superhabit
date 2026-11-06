import { describe, expect, it } from 'vite-plus/test';

import { hold, type HoldConfig, type HoldState } from './hold';
import type { Counter } from './progress';

const counter = (config: Partial<HoldConfig<number>> = {}) =>
  hold<number>({
    check: (m) => (m >= 0 ? null : 'Hips up'),
    lostCue: 'Back into position',
    ...config,
  });

function frames(
  ex: Counter<HoldState, number>,
  s: HoldState,
  value: number | null,
  from: number,
  to: number,
) {
  for (let t = from; t <= to; t += 66) s = ex.step(s, value, t);
  return s;
}

describe('hold', () => {
  it('requires 300 ms in shape and credits the entry from the first frame at zero', () => {
    const ex = counter();
    const before = structuredClone(ex.initial);
    const entering = frames(ex, ex.initial, 0, 0, 264);
    expect(entering).toMatchObject({ phase: 'waiting', heldMs: 0, since: 0 });
    expect(ex.step(entering, 0, 330)).toMatchObject({
      phase: 'active',
      heldMs: 330,
      lastIn: 330,
      broken: false,
    });
    expect(ex.initial).toEqual(before);
  });

  it('accrues exactly the detector time over a continuous hold', () => {
    const ex = counter();
    const s = frames(ex, ex.initial, 0, 0, 9966);
    expect(s).toMatchObject({ phase: 'active', heldMs: 9966, reps: 0, noReps: 0 });
    expect(ex.live(s)).toEqual({ signal: null, lowest: null });
  });

  it.each([null, -1])('forgives a 528 ms gap with sample %s and credits it on return', (value) => {
    const ex = counter();
    const active = frames(ex, ex.initial, 0, 0, 660);
    const gap = frames(ex, active, value, 726, 1122);
    expect(gap).toMatchObject({ phase: 'active', heldMs: 660, noReps: 0, broken: false });
    expect(ex.step(gap, 0, 1188)).toMatchObject({
      phase: 'active',
      heldMs: 1188,
      noReps: 0,
      cue: null,
    });
  });

  it.each([
    { value: null, cue: 'Back into position' },
    { value: -1, cue: 'Hips up' },
  ])('breaks once after a 990 ms gap with sample $value', ({ value, cue }) => {
    const ex = counter();
    const active = frames(ex, ex.initial, 0, 0, 660);
    const broken = frames(ex, active, value, 726, 1650);
    expect(broken).toMatchObject({
      phase: 'waiting',
      heldMs: 660,
      reps: 0,
      noReps: 1,
      broken: true,
      lastRep: { counted: false, cues: [cue], depth: null, upMs: null },
      since: null,
      lastIn: null,
    });
    expect(frames(ex, broken, value, 1716, 2640)).toMatchObject({
      noReps: 1,
      heldMs: 660,
    });
  });

  it('requires a new 300 ms entry after breaking, then clears broken', () => {
    const ex = counter();
    const active = frames(ex, ex.initial, 0, 0, 660);
    const broken = frames(ex, active, null, 726, 1650);
    const entering = frames(ex, broken, 0, 1716, 1980);
    expect(entering).toMatchObject({ phase: 'waiting', heldMs: 660, broken: true });
    expect(ex.step(entering, 0, 2046)).toMatchObject({
      phase: 'active',
      heldMs: 990,
      noReps: 1,
      broken: false,
    });
  });

  it('returns the identical state for earlier or duplicate timestamps', () => {
    const ex = counter();
    const s = frames(ex, ex.initial, 0, 0, 660);
    const before = structuredClone(s);
    expect(ex.step(s, -1, 594)).toBe(s);
    expect(ex.step(s, null, 660)).toBe(s);
    expect(s).toEqual(before);
    expect(ex.step(s, 0, 726).heldMs).toBe(726);
  });

  it('resets the anchors and broken flag while keeping accumulated progress', () => {
    const ex = counter();
    const active = frames(ex, ex.initial, 0, 0, 660);
    const broken = frames(ex, active, null, 726, 1650);
    const reset = ex.reset(broken);
    expect(reset).toMatchObject({
      phase: 'waiting',
      heldMs: 660,
      reps: 0,
      noReps: 1,
      broken: false,
      since: null,
      lastIn: null,
      lastAt: null,
      cue: null,
    });
    expect(frames(ex, reset, 0, 0, 264)).toMatchObject({ phase: 'waiting', heldMs: 660 });
    expect(frames(ex, reset, 0, 0, 330)).toMatchObject({ phase: 'active', heldMs: 990 });
    // Pausing an active hold also drops its streak instead of crediting time across the pause.
    expect(ex.step(ex.reset(active), 0, 2640)).toMatchObject({
      phase: 'waiting',
      since: 2640,
      heldMs: 660,
    });
  });

  it('applies a break before starting a new streak after a 2 s detector stall', () => {
    const ex = counter();
    const active = frames(ex, ex.initial, 0, 0, 660);
    const returned = ex.step(active, 0, 2660);
    expect(returned).toMatchObject({
      phase: 'waiting',
      heldMs: 660,
      noReps: 1,
      broken: true,
      since: 2660,
      lastRep: { counted: false, cues: ['Back into position'], depth: null, upMs: null },
    });
    expect(frames(ex, returned, 0, 2726, 2990)).toMatchObject({
      phase: 'active',
      heldMs: 990,
      noReps: 1,
      broken: false,
    });
  });

  it('restarts entry after a 2 s detector stall without crediting the unseen time', () => {
    const ex = counter();
    const entering = ex.step(ex.initial, 0, 0);
    const returned = ex.step(entering, 0, 2000);
    expect(returned).toMatchObject({
      phase: 'waiting',
      heldMs: 0,
      since: 2000,
      noReps: 0,
      broken: false,
    });
    expect(frames(ex, returned, 0, 2066, 2264)).toMatchObject({
      phase: 'waiting',
      heldMs: 0,
    });
    expect(frames(ex, returned, 0, 2066, 2330)).toMatchObject({
      phase: 'active',
      heldMs: 330,
    });
  });

  it.each([null, -1])('requires uninterrupted entry frames when sample %s interrupts', (value) => {
    const ex = counter();
    const entering = frames(ex, ex.initial, 0, 0, 264);
    const interrupted = ex.step(entering, value, 330);
    expect(interrupted).toMatchObject({ since: null, noReps: 0, heldMs: 0 });
    expect(frames(ex, interrupted, 0, 396, 660)).toMatchObject({ phase: 'waiting', heldMs: 0 });
    expect(frames(ex, interrupted, 0, 396, 726)).toMatchObject({ phase: 'active', heldMs: 330 });
  });

  it('keeps the latest form cue through tracking loss until the break', () => {
    const ex = counter({
      check: (m) => (m >= 0 ? null : m === -1 ? 'Hips up' : 'Straighten legs'),
    });
    const active = frames(ex, ex.initial, 0, 0, 660);
    const firstCue = ex.step(active, -1, 726);
    const latestCue = ex.step(firstCue, -2, 792);
    const broken = frames(ex, latestCue, null, 858, 1518);
    expect(broken.lastRep?.cues).toEqual(['Straighten legs']);
    expect(broken).toMatchObject({ heldMs: 660, noReps: 1 });
  });
});
