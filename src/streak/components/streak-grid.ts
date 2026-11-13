import { addDays, dayLabel, type Day } from '@/lib/day';
import type { DayKind } from '@/streak/streak';

/** The grid's days: 13 weeks (a quarter) ending with today's, a column per week, Monday first. */
export function weeks(today: Day): Day[][] {
  const count = 13;
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: count }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(monday, (week - count + 1) * 7 + day)),
  );
}

/** A picked day in words: "TODAY · TUE 10 NOV", "THU 5 NOV · FROZEN", "WED 28 OCT · MISSED". */
export function dayWords(day: Day, kind: DayKind, today: Day) {
  const suffix =
    kind === 'rest'
      ? ' · REST DAY'
      : kind === 'frozen'
        ? ' · FROZEN'
        : kind === 'missed'
          ? ' · MISSED'
          : '';
  return `${day === today ? 'TODAY · ' : ''}${dayLabel(day)}${suffix}`;
}

/** The gap between the grid's squares in px (the panel's `gap-0.75`). */
export const GAP = 3;

/**
 * The day under a tap at `x`, `y` on a grid `width` by `height`: null outside it or on a day still to
 * come. Squares share the size with the gaps between them; a tap in a gap picks the square before it.
 */
export function dayAt(today: Day, x: number, y: number, width: number, height: number): Day | null {
  const columns = weeks(today);
  const column = Math.floor((x * columns.length) / (width + GAP));
  const row = Math.floor((y * 7) / (height + GAP));
  const day = columns[column]?.[row];
  return x >= 0 && y >= 0 && day !== undefined && day <= today ? day : null;
}

const NUDGES = [
  'The couch is winning today. One set and it loses.',
  'Your muscles are bored. Give them one set.',
  'Zero reps so far. Every legend starts with one.',
];

/** Home's empty-day line: recovery asks for no work, an open training day gets a nudge. */
export function emptyDayWords(day: Day, kind: DayKind, today: Day): string | readonly string[] {
  if (kind === 'rest') return 'Rest day. Take it easy.';
  if (day === today) return NUDGES;
  return kind === 'frozen' ? 'No sets. A freeze kept your streak going.' : 'No sets on this day.';
}
