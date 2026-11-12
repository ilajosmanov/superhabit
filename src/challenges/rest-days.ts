import { addDays, isTimestamp, today as localDay, type Day } from '@/lib/day';
import { readChallengePlan } from '@/workout/plan/plan';
import { readSets } from '@/workout/plan/logged-set';
import { runCalendar, type Run, type Version, type Workout } from './progress';

/** Only the persisted facts needed for recovery; usable by both phone and server. */
export type RestLibrary = {
  challenges: readonly { id: string; currentVersionId: string; retiredAt: number | null }[];
  versions: readonly {
    id: string;
    challengeId: string;
    number: number;
    createdAt: number;
    days: number;
    dailyTotal: boolean;
    restartOnMiss: boolean;
    plan: unknown;
  }[];
  runs: readonly (Run & { challengeId: string })[];
  workouts: readonly Workout[];
  sets: Parameters<typeof readSets>[0];
};

/**
 * Dates where every active run prescribed recovery. A missing/unreadable plan never grants a rest.
 * Include ended/archived runs on their historical dates; leaving today doesn't excuse today's work.
 * Scheduled runs are pinned. Legacy own runs follow edits, so their historical duration uses only
 * versions already published on that date, never a later shortened plan.
 */
export function restDays(
  library: RestLibrary,
  today: Day,
  dayOf = (timestamp: number) => localDay(new Date(timestamp)),
): Day[] {
  if (library.runs.length === 0) return [];
  const challengeIds = new Set(library.runs.map((run) => run.challengeId));
  // Older sync validation accepted safe integers beyond Date's range. Unknown chronology cannot
  // establish recovery: keep workout points, but grant no recovery credit for this library.
  if (
    library.challenges.some(
      (row) => challengeIds.has(row.id) && row.retiredAt !== null && !isTimestamp(row.retiredAt),
    ) ||
    library.versions.some((row) => challengeIds.has(row.challengeId) && !isTimestamp(row.createdAt))
  )
    return [];
  const sets = readSets(library.sets);
  const storedVersions = library.versions
    .filter((row) => challengeIds.has(row.challengeId))
    .map((row) => {
      const plan = readChallengePlan(row.plan, row.days);
      const version: Version | null = plan
        ? {
            id: row.id,
            days: row.days,
            dailyTotal: row.dailyTotal,
            restartOnMiss: row.restartOnMiss,
            ...plan,
          }
        : null;
      return { row, version, publishedOn: dayOf(row.createdAt) };
    });
  const obligations = new Map<Day, boolean>();
  for (const run of library.runs) {
    const challenge = library.challenges.find((c) => c.id === run.challengeId);
    const archivedOn = challenge?.retiredAt == null ? null : dayOf(challenge.retiredAt);
    const until = [today, run.endedOn, archivedOn]
      .filter((day): day is Day => day !== null)
      .sort()[0];
    if (run.startedOn > until) continue;
    const rows = storedVersions
      .filter(({ row }) => row.challengeId === run.challengeId)
      .sort(
        (a, b) =>
          a.row.createdAt - b.row.createdAt ||
          a.row.number - b.row.number ||
          a.row.id.localeCompare(b.row.id),
      );
    const versions = rows.flatMap((row) => row.version ?? []);
    const workouts = library.workouts.filter(
      (workout) => workout.runId === run.id && versions.some((v) => v.id === workout.versionId),
    );
    const calendars = new Map<string, Map<Day, boolean>>();
    for (let day = run.startedOn; day <= until; day = addDays(day, 1)) {
      const found = run.pinnedVersionId
        ? rows.find(({ row }) => row.id === run.pinnedVersionId)
        : rows.findLast(({ publishedOn }) => publishedOn <= day);
      const version = found?.version;
      if (!challenge || !version) {
        obligations.set(day, false);
        continue;
      }
      let calendar = calendars.get(version.id);
      if (!calendar) {
        calendar = new Map(
          runCalendar({ run, version, versions, workouts, sets }, until).days.map((entry) => [
            entry.day,
            entry.result.rest === true,
          ]),
        );
        calendars.set(version.id, calendar);
      }
      const entry = calendar.get(day);
      if (entry === undefined) {
        // A pinned calendar cannot become active again. An unpinned run can follow a later edit,
        // but none of the dates between its finish and that edit carry an obligation.
        if (run.pinnedVersionId !== null) break;
        const next = rows.find(({ publishedOn }) => publishedOn > day);
        if (!next || next.publishedOn > until) break;
        day = addDays(next.publishedOn, -1);
        continue;
      }
      // Old clients may have joined a scheduled plan unpinned: never grant retroactive recovery.
      const rest = run.pinnedVersionId !== null && entry;
      obligations.set(day, (obligations.get(day) ?? true) && rest);
    }
  }
  return [...obligations].flatMap(([day, rest]) => (rest ? [day] : []));
}
