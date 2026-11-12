import type { Challenge, ScheduledDay } from './plan';

/** Day numbers are 1-based, relative to joining (not weekdays). */
export const isRestDay = (plan: Pick<Challenge, 'schedule'>, day: number) =>
  plan.schedule?.[day - 1] === 'rest';

/** Expand a weekly pattern into an explicit calendar for authoring; day 1 is the join day. */
export function weeklySchedule(
  days: number,
  training: readonly number[] = [1, 3, 5],
): ScheduledDay[] {
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    training.length === 0 ||
    training.some((n) => !Number.isInteger(n) || n < 1 || n > 7)
  ) {
    throw new Error('weekly schedule needs a positive duration and training days from 1 to 7');
  }
  const schedule: ScheduledDay[] = Array.from({ length: days }, (_, i) =>
    training.includes((i % 7) + 1) ? 'training' : 'rest',
  );
  if (!schedule.includes('training')) throw new Error('schedule needs a training day');
  return schedule;
}

/** Shorten the calendar, or repeat its authored pattern when extending it. */
export function resizeSchedule(schedule: readonly ScheduledDay[], days: number): ScheduledDay[] {
  if (!Number.isInteger(days) || days < 1 || !schedule.includes('training'))
    throw new Error('invalid schedule duration');
  return Array.from({ length: days }, (_, i) => schedule[i % schedule.length]);
}

export function scheduleLabel({ days, schedule }: Pick<Challenge, 'days' | 'schedule'>) {
  if (!schedule) return days === 1 ? 'ONE SESSION' : 'TRAIN EVERY DAY';
  const training = schedule.filter((day) => day === 'training').length;
  const rest = days - training;
  return `${training} ${training === 1 ? 'WORKOUT' : 'WORKOUTS'} · ${rest} REST ${rest === 1 ? 'DAY' : 'DAYS'}`;
}
