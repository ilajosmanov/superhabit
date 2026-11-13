import { describe, expect, it } from 'vite-plus/test';

import { streak } from './streak';
import { addDays } from '@/lib/day';

// Tuesday.
const TODAY = '2026-11-10';
const ago = (n: number) => addDays(TODAY, -n);
/** Alive days `from` to `to` days ago, both included. */
const span = (from: number, to: number) =>
  Array.from({ length: from - to + 1 }, (_, i) => ago(from - i));

describe('streak', () => {
  it('bridges recovery without increasing the count, earning or spending a freeze', () => {
    const alive = span(9, 3); // seven training days, then two recovery days
    const resting = streak(alive, TODAY, true, span(2, 0));
    expect(resting).toMatchObject({ current: 7, best: 7, held: 1, toNext: 7, status: 'rest' });
    expect([resting.kind(ago(2)), resting.kind(TODAY)]).toEqual(['rest', 'rest']);
    expect(resting.events).toEqual([{ id: `earned:${ago(3)}`, day: ago(3), kind: 'earned' }]);
    const trained = streak([...alive, TODAY], TODAY, true, span(2, 0));
    expect(trained).toMatchObject({ current: 8, status: 'done', toNext: 6 });
    expect(trained.kind(TODAY)).toBe('alive');
  });

  it('does not start a streak from rest or revive a streak broken before recovery', () => {
    expect(streak([], TODAY, false, span(2, 0))).toMatchObject({
      current: 0,
      best: 0,
      trained: false,
      status: 'rest',
    });
    expect(streak([ago(3)], TODAY, false, span(1, 0))).toMatchObject({
      current: 0,
      best: 1,
      status: 'rest',
    });
    // A workout still due in another challenge means today is not an eligible rest day.
    expect(streak([ago(2)], TODAY, false, [])).toMatchObject({ current: 0, status: 'slipped' });
  });

  it('pauses progress toward a freeze during recovery and earns it on the seventh training day', () => {
    const result = streak([...span(8, 3), TODAY], TODAY, true, span(2, 1));
    expect(result).toMatchObject({ current: 7, held: 1, toNext: 7, status: 'done' });
    expect(result.events).toEqual([]); // Today's earned freeze is recorded only after midnight.
  });
  it('starts empty: nothing to lose, every past day before you started', () => {
    const s = streak([], TODAY);

    expect(s).toMatchObject({
      current: 0,
      best: 0,
      trained: false,
      held: 0,
      toNext: 7,
      status: 'start',
    });
    expect([s.kind(ago(30)), s.kind(TODAY), s.kind(addDays(TODAY, 1))]).toEqual([
      'before',
      'open',
      'future',
    ]);
    expect(s.events).toEqual([]);
  });

  it('keeps the streak open all of today, and counts today once a set is done', () => {
    const waiting = streak(span(3, 1), TODAY);
    const done = streak(span(3, 0), TODAY);

    expect(waiting).toMatchObject({ current: 3, status: 'atRisk', toNext: 4 });
    expect(waiting.kind(TODAY)).toBe('open');
    expect(done).toMatchObject({ current: 4, status: 'done', toNext: 3 });
  });

  it('earns a freeze on the 7th day and spends it on the next miss, so the streak goes on', () => {
    // 12 to 6 days ago earns one; 5 days ago is missed; 4 to 1 days ago since.
    const s = streak([...span(12, 6), ...span(4, 1)], TODAY, true);

    expect(s.kind(ago(5))).toBe('frozen');
    // The frozen day counts in the streak, not toward the next freeze.
    expect(s).toMatchObject({ current: 12, best: 12, held: 0, toNext: 3, status: 'atRisk' });
    expect(s.events).toEqual([
      { id: `earned:${ago(6)}`, day: ago(6), kind: 'earned' },
      { id: `used:${ago(5)}`, day: ago(5), kind: 'used' },
    ]);
  });

  it('breaks on a second miss with one freeze, and says yesterday slipped', () => {
    const s = streak(span(9, 3), TODAY, true);

    expect([s.kind(ago(2)), s.kind(ago(1))]).toEqual(['frozen', 'missed']);
    expect(s).toMatchObject({ current: 0, best: 8, held: 0, toNext: 7, status: 'slipped' });
  });

  it('holds at most two freezes', () => {
    const s = streak(span(21, 1), TODAY, true);

    expect(s).toMatchObject({ current: 21, held: 2, toNext: null });
    expect(s.events.map(({ id }) => id)).toEqual([`earned:${ago(15)}`, `earned:${ago(8)}`]);
  });

  it('records only days that are over: a freeze earned today is held but written tomorrow', () => {
    const s = streak(span(6, 0), TODAY, true);

    expect(s.held).toBe(1);
    expect(s.events).toEqual([]);
  });

  it('earns no freeze while freezes are off: the miss after 7 days breaks the streak', () => {
    const s = streak([...span(12, 6), ...span(4, 1)], TODAY, false);

    expect(s.kind(ago(5))).toBe('missed');
    expect(s).toMatchObject({ current: 4, best: 7, held: 0 });
    expect(s.events).toEqual([]);
  });

  it('never calls days before your first set missed, and a long-broken streak just starts again', () => {
    const s = streak([ago(3)], TODAY);

    expect([s.kind(ago(4)), s.kind(ago(2)), s.kind(ago(1))]).toEqual([
      'before',
      'missed',
      'missed',
    ]);
    expect(s).toMatchObject({ current: 0, best: 1, status: 'start' });
  });

  it("waits for a day after today when the phone's clock goes back, but you have still trained", () => {
    const s = streak([addDays(TODAY, 1)], TODAY);

    expect(s).toMatchObject({ current: 0, trained: true, status: 'start' });
    expect(s.kind(TODAY)).toBe('open');
  });
});

it('says slipped after missing the training day following scheduled recovery', () => {
  const result = streak([ago(3)], TODAY, false, [ago(2)]);
  expect(result).toMatchObject({ current: 0, best: 1, status: 'slipped' });
  expect([result.kind(ago(2)), result.kind(ago(1))]).toEqual(['rest', 'missed']);
});

it('does not say slipped when the streak broke before the recovery day', () => {
  // Trained, missed (broken), rest, missed yesterday: nothing was left to slip.
  expect(streak([ago(4)], TODAY, false, [ago(2)])).toMatchObject({ current: 0, status: 'start' });
});
