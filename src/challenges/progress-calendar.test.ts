import { describe, expect, it } from 'vite-plus/test';

import { runCalendar, type ProgressInput } from './progress';
import { input, set, workout } from './__fixtures__/progress';
import { today } from '@/lib/day';

describe('run calendar', () => {
  it('advances through rest without credit or restarting, but still restarts after missed training', () => {
    const scheduled: ProgressInput = {
      ...input,
      version: {
        ...input.version,
        days: 5,
        schedule: ['training', 'rest', 'training', 'rest', 'training'],
      },
      workouts: [workout('first', 1)],
      sets: [set('first', 500)],
    };
    const rested = runCalendar(scheduled, '2026-11-03');
    expect(rested.state).toEqual({ state: 'active', day: 3, from: '2026-11-01' });
    expect(rested.days[1].result).toMatchObject({ rest: true, done: false, share: 0, sets: [] });
    expect(runCalendar(scheduled, '2026-11-04').state).toEqual({
      state: 'active',
      day: 1,
      from: '2026-11-04',
    });
  });

  it('finishes on a final rest day and handles a calendar beginning with recovery', () => {
    const scheduled: ProgressInput = {
      ...input,
      version: { ...input.version, schedule: ['rest', 'training', 'rest'] },
      workouts: [workout('second', 1, { day: '2026-11-02' })],
      sets: [set('second', 500)],
    };
    expect(runCalendar(scheduled, '2026-11-02').state.day).toBe(2);
    expect(runCalendar(scheduled, '2026-11-04').state).toEqual({
      state: 'finished',
      day: 3,
      from: '2026-11-01',
    });
  });
  const tried: ProgressInput = {
    ...input,
    workouts: [workout('first', 1), workout('partial', 2, { day: '2026-11-02' })],
    sets: [set('first', 500), set('partial', 250)],
  };

  it('restarts after an incomplete past day and preserves the missed stretch', () => {
    const { days, state } = runCalendar(tried, '2026-11-03');
    expect(state).toEqual({ state: 'active', day: 1, from: '2026-11-03' });
    expect(days.map(({ day, number, result }) => [day, number, result.share])).toEqual([
      ['2026-11-01', 1, 1],
      ['2026-11-02', 2, 0.5],
      ['2026-11-03', 1, 0],
    ]);
  });

  it('collapses consecutive offline misses to one effective start after the last miss', () => {
    const offline = {
      ...tried,
      workouts: [...tried.workouts, workout('back', 3, { day: '2026-11-06' })],
      sets: [...tried.sets, set('back', 500)],
    };
    const { days, state } = runCalendar(offline, '2026-11-07');
    expect(state).toEqual({
      state: 'active',
      day: 2,
      from: '2026-11-06',
    });
    expect(days.map(({ number }) => number)).toEqual([1, 2, 1, 1, 1, 1, 2]);
  });

  it('leaves incomplete days in place when restart is off and stops after the last day', () => {
    const noRestart = { ...tried, version: { ...tried.version, restartOnMiss: false } };
    expect(runCalendar(noRestart, '2026-11-03').state).toEqual({
      state: 'active',
      day: 3,
      from: '2026-11-01',
    });
    const { days, state } = runCalendar(noRestart, '2026-11-06');
    expect(state).toEqual({
      state: 'finished',
      day: 3,
      from: '2026-11-01',
    });
    expect(days.map(({ result }) => result.share)).toEqual([1, 0.5, 0]);
  });

  it('finishes after a fully completed final day and never restarts it on later misses', () => {
    const finished = {
      ...input,
      workouts: [
        workout('a', 1),
        workout('b', 2, { day: '2026-11-02' }),
        workout('c', 3, { day: '2026-11-03' }),
      ],
      sets: [set('a', 500), set('b', 500), set('c', 500)],
    };
    expect(runCalendar(finished, '2026-11-03').state).toEqual({
      state: 'active',
      day: 3,
      from: '2026-11-01',
    });
    const { days, state } = runCalendar(finished, '2026-12-01');
    expect(state).toEqual({
      state: 'finished',
      day: 3,
      from: '2026-11-01',
    });
    expect(days).toHaveLength(3);
    expect(
      runCalendar(
        {
          ...finished,
          run: { ...finished.run, endedOn: '2026-11-05', endReason: 'left' },
        },
        '2026-12-01',
      ).state,
    ).toEqual({ state: 'finished', day: 3, from: '2026-11-01' });
    // The last day itself must be complete when restarting is enabled.
    expect(
      runCalendar(
        { ...finished, sets: [set('a', 500), set('b', 500), set('c', 499)] },
        '2026-11-04',
      ).state,
    ).toEqual({ state: 'active', day: 1, from: '2026-11-04' });
  });

  it('never misses today, including a one-day run, until local midnight', () => {
    const oneDay = { ...input, version: { ...input.version, days: 1 } };
    expect(runCalendar(oneDay, today(new Date(2026, 10, 1, 23, 59, 59, 999))).state).toEqual({
      state: 'active',
      day: 1,
      from: '2026-11-01',
    });
    expect(runCalendar(oneDay, today(new Date(2026, 10, 2, 0, 0))).state).toEqual({
      state: 'active',
      day: 1,
      from: '2026-11-02',
    });
  });

  it('freezes a left run on its leave date and preserves its history', () => {
    const left = {
      ...tried,
      run: { ...tried.run, endedOn: '2026-11-02', endReason: 'left' as const },
    };
    expect(runCalendar(left, '2026-11-01').state).toEqual({
      state: 'active',
      day: 1,
      from: '2026-11-01',
    });
    const { days, state } = runCalendar(left, '2026-11-09');
    expect(state).toEqual({ state: 'left', day: 2, from: '2026-11-01' });
    expect(days.map(({ day }) => day)).toEqual(['2026-11-01', '2026-11-02']);
  });

  it('has no calendar days before joining', () => {
    const { days, state } = runCalendar(input, '2026-10-31');
    expect(days).toEqual([]);
    expect(state).toEqual({ state: 'active', day: 0, from: '2026-11-01' });
  });
});
