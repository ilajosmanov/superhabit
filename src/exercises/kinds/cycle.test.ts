import { describe, expect, it } from 'vite-plus/test';

import { engine, type CycleConfig } from './cycle';
import type { Counter, Progress, Rep } from './progress';

type Attempt = { samples: number };
const counter = (config: Partial<CycleConfig<number, Attempt, Rep>> = {}) =>
  engine<number, Attempt, Rep>({
    signal: (m) => m,
    up: 160,
    down: 100,
    shallow: 140,
    fresh: { samples: 0 },
    add: (a) => ({ samples: a.samples + 1 }),
    report: (_a, _m, r) => ({ ...r, cues: [] }),
    ...config,
  });

// Settle the real filter and satisfy two-sample confirmation at each position.
function hold<S extends Progress>(ex: Counter<S, number>, s: S, value: number, from: number) {
  for (let i = 0; i < 200; i++) s = ex.step(s, value, from + i * 66);
  return s;
}

function play(ex: ReturnType<typeof counter>, values: number[], start = ex.initial) {
  return values.reduce((s, value, i) => hold(ex, s, value, i * 200 * 66), start);
}

describe('engine', () => {
  it('counts a complete falling-signal cycle and leaves the input state untouched', () => {
    const ex = counter();
    const before = structuredClone(ex.initial);
    const s = play(ex, [170, 90, 170]);
    expect(s).toMatchObject({ reps: 1, noReps: 0, phase: 'up', heldMs: 0, broken: false });
    expect(s.lastRep).toMatchObject({ counted: true, depth: 90 });
    expect(ex.initial).toEqual(before);
  });

  it('counts a rising signal and reports depth and live values unmirrored', () => {
    const ex = counter({ up: 20, down: 80, shallow: 40 });
    const bottom = play(ex, [20, 90]);
    expect(bottom.phase).toBe('down');
    expect(ex.live(bottom).signal).toBeCloseTo(90);
    expect(ex.live(bottom).lowest).toBeCloseTo(90);
    const s = hold(ex, bottom, 20, 2 * 200 * 66);
    expect(s.reps).toBe(1);
    expect(s.lastRep?.depth).toBeCloseTo(90);
  });

  it('reports a no-rep when the completed attempt fails the clean gate', () => {
    const ex = counter({ clean: () => false });
    const s = play(ex, [170, 90, 170]);
    expect(s).toMatchObject({ reps: 0, noReps: 1, phase: 'up' });
    expect(s.lastRep?.counted).toBe(false);
  });

  it('retains form from gated signals without extending their tracking lifetime', () => {
    const ex = counter({
      signal: (m) => (m === 50 ? null : m),
      add: (a, m) => ({ samples: a.samples + Number(m === 50) }),
      clean: (a) => a.samples === 0,
      report: (a, _m, r) => ({ ...r, cues: a.samples ? ['Keep upright'] : [] }),
    });
    const bottom = play(ex, [170, 90]);
    const gated = ex.step(bottom, 50, (bottom.lastSeenAt ?? 0) + 66);
    expect(gated.lastSeenAt).toBe(bottom.lastSeenAt);
    expect(gated.filter).toBe(bottom.filter);
    const done = hold(ex, gated, 170, (bottom.lastSeenAt ?? 0) + 132);
    expect(done).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Keep upright'] },
    });
    expect(ex.step(gated, 50, (bottom.lastSeenAt ?? 0) + 1001).phase).toBe('waiting');
  });

  it('keeps counts on reset and requires the start before another attempt', () => {
    const ex = counter();
    const completed = play(ex, [170, 90, 170, 130, 170]);
    expect(completed).toMatchObject({ reps: 1, noReps: 1 });
    const reset = ex.reset(completed);
    expect(reset).toMatchObject({ reps: 1, noReps: 1, phase: 'waiting', broken: false });
    expect(reset.filter).toBeUndefined();
    expect(reset.attempt.startAt).toBeUndefined();
    expect(reset.attempt.bottomAt).toBeUndefined();
    expect(ex.live(reset)).toEqual({ signal: null, lowest: null });
    const bottom = hold(ex, reset, 90, 5 * 200 * 66);
    expect(bottom).toMatchObject({ reps: 1, noReps: 1, phase: 'waiting' });
    expect(hold(ex, bottom, 170, 6 * 200 * 66)).toMatchObject({
      reps: 1,
      noReps: 1,
      phase: 'up',
    });
  });

  it('ignores a frame stamped before the last one', () => {
    const ex = counter();
    const bottom = play(ex, [170, 90]);
    const at = bottom.lastSeenAt ?? 0;
    expect(ex.step(bottom, 170, at - 500)).toBe(bottom);
    expect(ex.step(bottom, 170, at)).toBe(bottom);
    const done = hold(ex, bottom, 170, at + 66);
    expect(done.reps).toBe(1);
    expect(done.lastRep?.upMs).toBeGreaterThan(0);
  });

  it('drops a mid-rep attempt after a 1.2 second tracking gap', () => {
    const ex = counter();
    const bottom = play(ex, [170, 90]);
    expect(bottom.phase).toBe('down');
    const lostAt = (bottom.lastSeenAt ?? 0) + 1200;
    const lost = ex.step(bottom, null, lostAt);
    expect(lost).toMatchObject({ reps: 0, noReps: 0, phase: 'waiting' });
    expect(lost.filter).toBeUndefined();
    const stillDown = hold(ex, lost, 90, lostAt + 66);
    expect(hold(ex, stillDown, 170, lostAt + 201 * 66)).toMatchObject({
      reps: 0,
      noReps: 0,
      phase: 'up',
    });
  });
});

describe('engine thresholds, glitches and tracking gaps', () => {
  it('accepts the exact up and down thresholds', () => {
    const s = play(counter(), [160, 100, 160]);
    expect(s).toMatchObject({ reps: 1, noReps: 0, phase: 'up' });
    expect(s.lastRep?.depth).toBeCloseTo(100);
  });

  it('waits for the top before an attempt, and counts only back at the top', () => {
    expect(play(counter(), [90, 120, 150])).toMatchObject({ phase: 'waiting', reps: 0, noReps: 0 });
    expect(play(counter(), [170, 90, 150, 95, 150])).toMatchObject({ reps: 0, noReps: 0 });
  });

  it('switches phase only once a crossing holds for two samples', () => {
    const ex = counter();
    const once = ex.step(ex.initial, 170, 0);
    expect(once.phase).toBe('waiting');
    expect(ex.step(once, 170, 66).phase).toBe('up');
  });

  it('smooths away a one-frame dip past the bottom', () => {
    const ex = counter();
    const top = play(ex, [170]);
    const t = (top.lastSeenAt ?? 0) + 66;
    expect(hold(ex, ex.step(top, 100, t), 170, t + 66)).toMatchObject({
      reps: 0,
      noReps: 0,
      lastRep: null,
    });
  });

  it('keeps an attempt through a one-second gap, and drops it when frames stall longer', () => {
    const ex = counter();
    const bottom = play(ex, [170, 90]);
    const at = bottom.lastSeenAt ?? 0;
    expect(hold(ex, ex.step(bottom, null, at + 500), 170, at + 1000)).toMatchObject({ reps: 1 });
    expect(hold(ex, bottom, 170, at + 1100)).toMatchObject({ reps: 0, noReps: 0, phase: 'up' });
  });

  it.each([NaN, Infinity, -Infinity, -1, 181])(
    'ignores an invalid value (%s) without extending tracking or losing the rep',
    (invalid) => {
      const ex = counter();
      const bottom = play(ex, [170, 90]);
      const at = bottom.lastSeenAt ?? 0;
      expect(ex.step(bottom, invalid, at + 66)).toBe(bottom);
      expect(hold(ex, bottom, 170, at + 132)).toMatchObject({ reps: 1, lastRep: { depth: 90 } });
    },
  );
});
