import { describe, expect, it } from 'vite-plus/test';

import { sequence, type SequenceConfig } from './sequence';

type Pose = 'stand' | 'crouch' | 'plank' | 'crouch2';
const counter = (config: Partial<SequenceConfig<string, Pose>> = {}) =>
  sequence<string, Pose>({
    pose: (m) => (m === 'stand' || m === 'crouch' || m === 'plank' || m === 'crouch2' ? m : null),
    order: ['stand', 'crouch', 'plank', 'crouch2'],
    maxStepMs: 2000,
    cue: (missed) => `Expected ${missed}`,
    ...config,
  });

function player(ex = counter()) {
  let state = ex.initial;
  let nowMs = 0;
  function frames(sample: string | null, n = 2) {
    for (let i = 0; i < n; i++) {
      state = ex.step(state, sample, nowMs);
      nowMs += 50;
    }
    return state;
  }
  return { frames };
}

describe('sequence', () => {
  it('counts only the full ordered sequence, including the return to stand', () => {
    const ex = counter();
    const before = structuredClone(ex.initial);
    const p = player(ex);
    expect(p.frames('plank')).toMatchObject({ phase: 'waiting', reps: 0, noReps: 0 });
    expect(p.frames('stand')).toMatchObject({ phase: 'up', reps: 0, next: 1 });
    expect(p.frames('crouch')).toMatchObject({ phase: 'active', reps: 0, next: 2 });
    expect(p.frames('plank')).toMatchObject({ phase: 'active', reps: 0, next: 3 });
    expect(p.frames('crouch2')).toMatchObject({ phase: 'active', reps: 0, next: 0 });
    expect(p.frames('stand', 1).reps).toBe(0);
    const done = p.frames('stand', 1);
    expect(done).toMatchObject({
      phase: 'up',
      reps: 1,
      noReps: 0,
      heldMs: 0,
      broken: false,
      next: 1,
      lastRep: { counted: true, cues: [], depth: null, upMs: null },
    });
    expect(p.frames('stand', 20).reps).toBe(1);
    p.frames('crouch');
    p.frames('plank');
    p.frames('crouch2');
    expect(p.frames('stand').reps).toBe(2);
    expect(ex.initial).toEqual(before);
    expect(ex.live(done)).toEqual({ signal: null, lowest: null });
  });

  it('requires two consecutive frames, clearing confirmation between named poses', () => {
    const p = player();
    expect(p.frames('stand', 1)).toMatchObject({ phase: 'waiting', next: 0 });
    p.frames('between', 1);
    expect(p.frames('stand', 1).phase).toBe('waiting');
    expect(p.frames('stand', 1).phase).toBe('up');
    expect(p.frames('crouch', 1)).toMatchObject({ phase: 'up', next: 1 });
    p.frames('stand', 1);
    expect(p.frames('crouch', 1)).toMatchObject({ phase: 'up', next: 1 });
    p.frames('between', 1);
    expect(p.frames('crouch', 1)).toMatchObject({ phase: 'up', next: 1 });
    expect(p.frames('crouch', 1)).toMatchObject({ phase: 'active', next: 2 });
    expect(p.frames('plank', 1)).toMatchObject({ phase: 'active', next: 2 });
    p.frames(null, 1);
    expect(p.frames('plank', 1)).toMatchObject({ phase: 'active', next: 2 });
    expect(p.frames('plank', 1)).toMatchObject({ phase: 'active', next: 3 });
  });

  it.each([0, -50])('ignores pose frames offset by %i ms from the last timestamp', (offset) => {
    const ex = counter();
    const first = ex.step(ex.initial, 'stand', 50);
    expect(ex.step(first, 'stand', 50 + offset)).toBe(first);
    expect(first).toMatchObject({ phase: 'waiting', next: 0, candidate: { pose: 'stand', n: 1 } });

    const start = ex.step(first, 'stand', 100);
    const crouch = ex.step(start, 'crouch', 150);
    expect(ex.step(crouch, 'crouch', 150 + offset)).toBe(crouch);
    expect(ex.step(crouch, 'plank', 150 + offset)).toBe(crouch);
    expect(crouch).toMatchObject({ phase: 'up', next: 1, candidate: { pose: 'crouch', n: 1 } });
    expect(ex.step(crouch, 'crouch', 200)).toMatchObject({
      phase: 'active',
      next: 2,
      reps: 0,
      noReps: 0,
    });
  });

  it('fails once after 2.1 seconds without the next pose and waits for stand again', () => {
    const p = player();
    p.frames('stand');
    p.frames('crouch');
    // Tracked transition frames distinguish a pose deadline from tracking loss.
    expect(p.frames('between', 40)).toMatchObject({ phase: 'active', next: 2, noReps: 0 });
    const failed = p.frames('plank');
    expect(failed).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 1,
      next: 0,
      stepAt: null,
      lastRep: { counted: false, cues: ['Expected plank'], depth: null, upMs: null },
    });
    expect(p.frames('plank', 50)).toMatchObject({ phase: 'waiting', noReps: 1 });
    expect(p.frames('stand')).toMatchObject({ phase: 'up', noReps: 1, next: 1 });
    p.frames('crouch');
    p.frames('plank');
    p.frames('crouch2');
    expect(p.frames('stand')).toMatchObject({ reps: 1, noReps: 1 });
  });

  it('fails a confirmed skipped pose and never counts the unfinished sequence', () => {
    const p = player();
    p.frames('stand');
    expect(p.frames('plank', 1)).toMatchObject({ phase: 'up', noReps: 0 });
    expect(p.frames('plank', 1)).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Expected crouch'] },
    });
    p.frames('crouch2');
    expect(p.frames('stand')).toMatchObject({ phase: 'up', reps: 0, noReps: 1 });
  });

  it('times out tracked transitions from stand to crouch and never counts the unfinished sequence', () => {
    const p = player();
    p.frames('stand');
    expect(p.frames('between', 40)).toMatchObject({ phase: 'up', next: 1, noReps: 0 });
    expect(p.frames('between', 2)).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 1,
      next: 0,
      stepAt: null,
      lastRep: { counted: false, cues: ['Expected crouch'], depth: null, upMs: null },
    });
    p.frames('crouch');
    p.frames('plank');
    p.frames('crouch2');
    expect(p.frames('stand')).toMatchObject({ phase: 'up', reps: 0, noReps: 1 });
  });

  it('checks the overdue start deadline before an unconfirmed stand frame can refresh it', () => {
    const ex = counter();
    const p = player(ex);
    p.frames('stand'); // Confirmed at 50 ms; crouch is due at 2050 ms.
    const tracked = p.frames('between', 39); // Tracked null poses through 2000 ms.
    let state = ex.step(tracked, 'stand', 2100);
    expect(state).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 1,
      next: 0,
      stepAt: null,
      lastRep: { counted: false, cues: ['Expected crouch'], depth: null, upMs: null },
    });
    const rest = ['crouch', 'crouch', 'plank', 'plank', 'crouch2', 'crouch2', 'stand', 'stand'];
    for (const [i, pose] of rest.entries()) state = ex.step(state, pose, 2150 + i * 50);
    expect(state).toMatchObject({ phase: 'up', reps: 0, noReps: 1, next: 1 });
  });

  it('drops a sequence after 1.2 seconds of tracking loss without a no-rep', () => {
    const p = player();
    p.frames('stand');
    p.frames('crouch');
    expect(p.frames(null, 20)).toMatchObject({ phase: 'active', noReps: 0 });
    expect(p.frames(null, 4)).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 0,
      lastRep: null,
      next: 0,
      stepAt: null,
      candidate: null,
    });
    p.frames('plank');
    p.frames('crouch2');
    expect(p.frames('stand')).toMatchObject({ phase: 'up', reps: 0, noReps: 0 });
  });

  it('drops tracking loss overlapping the step deadline without a failure', () => {
    const ex = counter();
    const p = player(ex);
    p.frames('stand');
    p.frames('crouch'); // Confirmed at 150 ms; the next pose is due at 2150 ms.
    const tracked = p.frames('between', 36); // Last seen at 1950 ms.
    const unseen = ex.step(tracked, null, 2200);
    expect(unseen).toMatchObject({ phase: 'active', next: 2, noReps: 0, lastRep: null });
    for (const sample of [null, 'plank']) {
      expect(ex.step(unseen, sample, 3150)).toMatchObject({
        phase: 'waiting',
        reps: 0,
        noReps: 0,
        lastRep: null,
        next: 0,
        stepAt: null,
      });
    }
  });

  it('applies an overdue step deadline when tracking resumes within one second', () => {
    const ex = counter();
    const p = player(ex);
    p.frames('stand');
    p.frames('crouch');
    const tracked = p.frames('between', 36);
    const unseen = ex.step(tracked, null, 2200);
    expect(ex.step(unseen, 'plank', 2250)).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Expected plank'] },
    });
  });

  it('idles in stand for ten seconds without failures before or after a rep', () => {
    const p = player();
    expect(p.frames('stand', 201)).toMatchObject({ phase: 'up', reps: 0, noReps: 0 });
    p.frames('crouch');
    p.frames('plank');
    p.frames('crouch2');
    p.frames('stand');
    expect(p.frames('stand', 200)).toMatchObject({ phase: 'up', reps: 1, noReps: 0 });
  });

  it('does not refresh the active deadline by holding the previous pose', () => {
    const p = player();
    p.frames('stand');
    p.frames('crouch');
    expect(p.frames('crouch', 40)).toMatchObject({ phase: 'active', noReps: 0 });
    expect(p.frames('crouch', 1)).toMatchObject({
      phase: 'waiting',
      noReps: 1,
      lastRep: { cues: ['Expected plank'] },
    });
  });

  it('accepts the next pose at the exact deadline', () => {
    const p = player();
    p.frames('stand');
    p.frames('crouch');
    p.frames('between', 38);
    expect(p.frames('plank')).toMatchObject({ phase: 'active', next: 3, noReps: 0 });
  });

  it('expires a detector stall before applying the step deadline or accepting a pose', () => {
    const ex = counter();
    const p = player(ex);
    p.frames('stand');
    const active = p.frames('crouch');
    expect(ex.step(active, 'plank', 2250)).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 0,
      next: 0,
    });
    const returning = ex.step(active, 'stand', 2250);
    expect(returning.phase).toBe('waiting');
    expect(ex.step(returning, 'stand', 2300)).toMatchObject({ phase: 'up', next: 1, noReps: 0 });
  });

  it('resets an attempt and its confirmation while preserving accumulated totals', () => {
    const ex = counter();
    const p = player(ex);
    p.frames('stand');
    p.frames('plank');
    p.frames('stand');
    p.frames('crouch');
    p.frames('plank');
    p.frames('crouch2');
    p.frames('stand');
    const active = p.frames('crouch');
    const before = structuredClone(active);
    const reset = ex.reset(active);
    expect(reset).toMatchObject({
      phase: 'waiting',
      reps: 1,
      noReps: 1,
      heldMs: 0,
      broken: false,
      next: 0,
      stepAt: null,
      candidate: null,
    });
    expect(reset.lastSeenAt).toBeUndefined();
    expect(reset.lastRep).toBe(active.lastRep);
    expect(active).toEqual(before);
    expect(ex.step(reset, 'plank', 0)).toMatchObject({ phase: 'waiting', reps: 1, noReps: 1 });
    const start = ex.step(reset, 'stand', 0);
    expect(start.phase).toBe('waiting');
    expect(ex.step(start, 'stand', 50).phase).toBe('up');
  });
});
