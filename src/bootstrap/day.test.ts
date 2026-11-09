import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createActor, setup } from 'xstate';

import { dayClock, type DayEvent } from './day';

const app = vi.hoisted(() => {
  const state: { onChange: ((state: string) => void) | null; removed: boolean } = {
    onChange: null,
    removed: false,
  };
  return state;
});
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      app.onChange = listener;
      return { remove: () => (app.removed = true) };
    },
  },
}));

afterEach(() => vi.useRealTimers());

/** A parent that keeps every day it was told. */
function listen() {
  const days: string[] = [];
  const actor = createActor(
    setup<{}, DayEvent, { dayClock: typeof dayClock }>({ actors: { dayClock } }).createMachine({
      invoke: { src: 'dayClock' },
      on: { day: { actions: ({ event }) => days.push(event.day) } },
    }),
  ).start();
  return { days, actor };
}

it('tells the day at the start and again at each local midnight', () => {
  // 23:59 in Tallinn on the 9th.
  vi.useFakeTimers({ now: new Date(2026, 10, 9, 23, 59) });
  const { days, actor } = listen();
  vi.advanceTimersByTime(59_999);
  expect(days).toEqual(['2026-11-09']);
  vi.advanceTimersByTime(1);
  expect(days).toEqual(['2026-11-09', '2026-11-10']);
  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  expect(days).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
  actor.stop();
});

it('reads the day again when the app comes back, and stops both on cleanup', () => {
  vi.useFakeTimers({ now: new Date(2026, 10, 9, 12) });
  const { days, actor } = listen();
  // The phone slept through midnight; no timer fired.
  vi.setSystemTime(new Date(2026, 10, 10, 8));
  app.onChange?.('background');
  app.onChange?.('active');
  expect(days).toEqual(['2026-11-09', '2026-11-10']);

  actor.stop();
  expect(app.removed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('turns at midnight on the 23-hour and the 25-hour day of summer time', () => {
  // Tallinn springs forward on 29 March 2026 and falls back on 25 October 2026.
  const hour = 60 * 60 * 1000;
  for (const [day, next, hours] of [
    [new Date(2026, 2, 29), '2026-03-30', 23],
    [new Date(2026, 9, 25), '2026-10-26', 25],
  ] as const) {
    vi.useFakeTimers({ now: day });
    const { days, actor } = listen();
    vi.advanceTimersByTime(hours * hour - 1);
    expect(days).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(days.at(-1)).toBe(next);
    actor.stop();
  }
});

it('reads the real day when the midnight timer fires late, and arms for the next one', () => {
  vi.useFakeTimers({ now: new Date(2026, 10, 9, 23, 59) });
  const { days, actor } = listen();
  // The phone dozed: the clock reads 00:07 when the one-minute timer finally runs.
  vi.setSystemTime(new Date(2026, 10, 10, 0, 7));
  vi.advanceTimersToNextTimer();
  expect(days).toEqual(['2026-11-09', '2026-11-10']);
  vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 7 * 60 * 1000);
  expect(days).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
  actor.stop();
});
