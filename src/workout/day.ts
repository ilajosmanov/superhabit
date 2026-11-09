/** Local YYYY-MM-DD; UTC arithmetic keeps calendar days independent of DST. */
export type Day = string;

const DAY_MS = 86_400_000;
export const dayNumber = (day: Day) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS;
export const dayAt = (n: number): Day => new Date(n * DAY_MS).toISOString().slice(0, 10);

const pad = (n: number) => String(n).padStart(2, '0');
/** The phone's calendar day, not UTC's: a 00:30 workout counts for the day it is where you are. */
export const today = (now = new Date()): Day =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const addDays = (day: Day, n: number) => dayAt(dayNumber(day) + n);

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "SAT 7 NOV", for mono labels. */
export function dayLabel(day: Day) {
  const date = new Date(dayNumber(day) * DAY_MS);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** The next local midnight after `now`, when today turns into tomorrow (a DST night included). */
export const nextMidnight = (now = new Date()) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
