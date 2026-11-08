import { describe, expect, it } from 'vite-plus/test';

import type { Rep } from './progress';
import type { Side } from '@/exercises/body/geometry';
import { sided, type SidedConfig } from './sided';

type Sample = { l: number | null; r: number | null };
type Attempt = { samples: number };
const counter = (config: Partial<SidedConfig<Sample, Attempt, Rep>> = {}) =>
  sided<Sample, Attempt, Rep>({
    signal: (m, side) => (side === 'left' ? m.l : m.r),
    up: 160,
    down: 100,
    shallow: 140,
    fresh: { samples: 0 },
    add: (a) => ({ samples: a.samples + 1 }),
    report: (_a, _m, r) => ({ ...r, cues: r.counted ? [] : ['Go lower'] }),
    ...config,
  });

// Feed real cycles at detector cadence, allowing the filter and confirmation to settle.
function player(ex = counter()) {
  let state = ex.initial;
  let nowMs = 0;
  function hold(sample: Sample | null, frames = 30) {
    for (let i = 0; i < frames; i++) {
      state = ex.step(state, sample, nowMs);
      nowMs += 66;
    }
    return state;
  }
  function rep(side: Side, bottom = 90) {
    hold(side === 'left' ? { l: bottom, r: 170 } : { l: 170, r: bottom });
    return hold({ l: 170, r: 170 });
  }
  return { hold, rep };
}

describe('sided', () => {
  it('counts every clean side rep and banks per-side totals', () => {
    const ex = counter();
    const before = structuredClone(ex.initial);
    const p = player(ex);
    p.hold({ l: 170, r: 170 });
    expect(p.rep('left').reps).toBe(1);
    expect(p.rep('left').reps).toBe(2);
    expect(p.rep('right')).toMatchObject({ reps: 3, noReps: 0, lastSide: 'right' });
    expect(p.rep('right')).toMatchObject({
      reps: 4,
      left: { reps: 2 },
      right: { reps: 2 },
      heldMs: 0,
      broken: false,
    });
    expect(ex.initial).toEqual(before);
  });

  it('counts a failed left separately from a clean right', () => {
    const p = player();
    p.hold({ l: 170, r: 170 });
    expect(p.rep('left', 130)).toMatchObject({
      reps: 0,
      noReps: 1,
      lastSide: 'left',
      lastRep: { counted: false, cues: ['Go lower'] },
    });
    expect(p.rep('right')).toMatchObject({
      reps: 1,
      noReps: 1,
      left: { reps: 0, noReps: 1 },
      right: { reps: 1, noReps: 0 },
      lastRep: { counted: true },
    });
  });

  it('reports repeated failures when report reuses the same object', () => {
    const failed: Rep = { counted: false, cues: ['Go lower'], depth: 130, upMs: null };
    const clean: Rep = { counted: true, cues: [], depth: 90, upMs: null };
    const p = player(counter({ report: (_a, _m, r) => (r.counted ? clean : failed) }));
    p.hold({ l: 170, r: 170 });
    expect(p.rep('left', 130).lastRep).toBe(failed);
    expect(p.rep('right').lastRep).toBe(clean);

    const repeated = p.rep('left', 130);
    expect(repeated).toMatchObject({
      reps: 1,
      noReps: 2,
      lastSide: 'left',
      left: { reps: 0, noReps: 2 },
      right: { reps: 1, noReps: 0 },
    });
    expect(repeated.lastRep).toBe(failed);
  });

  it('expires only an unseen left after 1.2 seconds while the right keeps counting', () => {
    const ex = counter();
    const p = player(ex);
    p.hold({ l: 170, r: 170 });
    const bottom = p.hold({ l: 90, r: 90 });
    expect(bottom).toMatchObject({ left: { phase: 'down' }, right: { phase: 'down' } });
    const lost = p.hold({ l: null, r: 90 }, 19);
    expect(lost).toMatchObject({
      phase: 'down',
      left: { phase: 'waiting' },
      right: { phase: 'down' },
      reps: 0,
      noReps: 0,
    });
    expect(lost.left.filter).toBeUndefined();
    expect(ex.live(lost).signal).toBeCloseTo(90);
    expect(ex.live(lost).lowest).toBeCloseTo(90);
    expect(p.hold({ l: null, r: 170 })).toMatchObject({
      phase: 'up',
      reps: 1,
      left: { phase: 'waiting', reps: 0 },
      right: { reps: 1 },
    });
    p.hold({ l: null, r: 90 });
    expect(p.hold({ l: null, r: 170 }).reps).toBe(2);
  });

  it('waits only while both sides wait and follows the last phase change', () => {
    const ex = counter();
    const p = player(ex);
    expect(p.hold(null).phase).toBe('waiting');
    expect(p.hold({ l: 90, r: 90 }).phase).toBe('waiting');
    expect(p.hold({ l: 170, r: null })).toMatchObject({ phase: 'up', lastSide: 'left' });
    expect(p.hold({ l: 170, r: 90 }).phase).toBe('up');
    expect(p.hold({ l: 170, r: 170 })).toMatchObject({ phase: 'up', lastSide: 'right' });
    expect(p.hold({ l: 90, r: 170 })).toMatchObject({ phase: 'down', lastSide: 'left' });
    const lostRight = p.hold({ l: 90, r: null }, 19);
    expect(lostRight).toMatchObject({ phase: 'down', lastSide: 'right' });
    expect(ex.live(lostRight).signal).toBeCloseTo(90);
    expect(ex.live(lostRight).lowest).toBeCloseTo(90);
    expect(p.hold(null)).toMatchObject({
      phase: 'waiting',
      left: { phase: 'waiting' },
      right: { phase: 'waiting' },
      noReps: 0,
    });
  });

  it.each(['left', 'right'] as const)(
    'shows a fresh shallow %s reading over the other side’s stale phase change',
    (side) => {
      const ex = counter();
      const p = player(ex);
      // Make the other side the last phase change without letting either cycle expire.
      p.hold(side === 'left' ? { l: 170, r: null } : { l: null, r: 170 }, 4);
      const start = p.hold({ l: 170, r: 170 }, 4);
      expect(start.lastSide).toBe(side === 'left' ? 'right' : 'left');
      const shallow = p.hold(side === 'left' ? { l: 135, r: null } : { l: null, r: 135 }, 8);
      expect(shallow).toMatchObject({ left: { phase: 'up' }, right: { phase: 'up' } });
      expect(ex.live(shallow).signal).toBeCloseTo(135, 0);
      expect(ex.live(shallow).lowest).toBeLessThan(140);
    },
  );

  it('shows the side driving down when both are seen on the same frame', () => {
    const ex = counter();
    const p = player(ex);
    p.hold({ l: 170, r: 170 }, 4);
    // Neither side changes phase yet: 110 is below shallow but above down.
    const driving = p.hold({ l: 110, r: 170 }, 4);
    expect(driving).toMatchObject({ left: { phase: 'up' }, right: { phase: 'up' } });
    expect(ex.live(driving).signal).toBeLessThan(120);
  });

  it('resets both attempts and keeps totals, requiring start positions again', () => {
    const ex = counter();
    const p = player(ex);
    p.hold({ l: 170, r: 170 });
    p.rep('left');
    p.rep('right');
    p.rep('left', 130);
    const bottom = p.hold({ l: 90, r: 90 });
    const reset = ex.reset(bottom);
    expect(reset).toMatchObject({
      reps: 2,
      noReps: 1,
      phase: 'waiting',
      broken: false,
      heldMs: 0,
      left: { reps: 1, noReps: 1, phase: 'waiting' },
      right: { reps: 1, noReps: 0, phase: 'waiting' },
    });
    expect(reset.lastRep).toBe(bottom.lastRep);
    expect(ex.live(reset)).toEqual({ signal: null, lowest: null });
    let state = reset;
    const startAt = Math.max(bottom.left.lastSeenAt ?? 0, bottom.right.lastSeenAt ?? 0) + 66;
    for (let i = 0; i < 30; i++) state = ex.step(state, { l: 90, r: 90 }, startAt + i * 66);
    expect(state).toMatchObject({ reps: 2, noReps: 1, phase: 'waiting' });
    for (let i = 30; i < 60; i++) state = ex.step(state, { l: 170, r: 170 }, startAt + i * 66);
    expect(state).toMatchObject({ reps: 2, noReps: 1, phase: 'up' });
  });

  it('counts simultaneous completions on both sides while exposing one latest report', () => {
    const ex = counter();
    const p = player(ex);
    p.hold({ l: 170, r: 170 });
    const bottom = p.hold({ l: 90, r: 80 });
    expect(ex.live(bottom).signal).toBeCloseTo(80);
    expect(ex.live(bottom).lowest).toBeCloseTo(80);
    const done = p.hold({ l: 170, r: 170 });
    expect(done).toMatchObject({ reps: 2, noReps: 0, lastSide: 'right' });
    expect(done.lastRep).toBe(done.right.lastRep);
    expect(done.lastRep?.depth).toBeCloseTo(80);
  });
});
