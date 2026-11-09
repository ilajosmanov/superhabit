import { toEntry, type CatalogEntry } from './catalog';
import { ONE_GO, oneGo } from './challenges';
import { draftOf } from './draft';
import { counting, runCalendar, versionOf, type DayResult, type Version } from './progress';
import { doneToday, type Run } from './run-view';
import { OURS, SUGGESTED_CHALLENGES } from './suggested';
import { userId } from '@/storage/account';
import type * as schema from '@/storage/schema';
import type { Day } from '@/workout/day';
import type { LogTarget } from '@/workout/log';
import { readSets, type LoggedSet } from '@/workout/logged-set';
import { expand, readPlan } from '@/workout/plan';
import { setAmounts, workoutResults } from '@/workout/results';

/** The library's tables, whole, as the screens read them. */
export type Library = {
  challenges: readonly (typeof schema.challenges.$inferSelect)[];
  versions: readonly (typeof schema.challengeVersions.$inferSelect)[];
  runs: readonly (typeof schema.runs.$inferSelect)[];
  workouts: readonly (typeof schema.workouts.$inferSelect)[];
  sets: readonly (typeof schema.sets.$inferSelect)[];
};

/** A version this app can run; it is also the `Challenge` the plan, cards and session take. */
export type Readable = Version & { name: string };

export type Joined = {
  challengeId: string;
  runId: string;
  /** The version the run follows. */
  challenge: Readable;
  run: Run;
  /**
   * What each exercise set got on each day of `progress`, on the try the day shows (a daily total: the
   * day's sum); nothing done on a day with no try. Undefined for a try under another version: its sets
   * don't line up with this plan.
   */
  amounts: readonly (readonly number[] | undefined)[];
};
/** A run whose version is from a newer app: shown with "Update the app", never with another version. */
export type Unavailable = { challengeId: string; runId: string; name: string; challenge: null };
export type Yours = Joined | Unavailable;

/** Null for a plan from a newer app (an exercise or shape this one doesn't know). */
function readVersion(row: Library['versions'][number]): Readable | null {
  const session = readPlan(row.plan);
  const { id, name, days, dailyTotal, restartOnMiss } = row;
  return session && { id, name, days, dailyTotal, restartOnMiss, session };
}

function amountsOn(version: Readable, result: DayResult, sets: readonly LoggedSet[]) {
  if (result.total !== undefined) return [result.total];
  const { shown } = result;
  if (shown && shown.versionId !== version.id) return undefined;
  const steps = expand(version.session);
  return setAmounts(steps, workoutResults(steps, shown?.id ?? '', sets));
}

/** A session under way: its open workout, and the version it started on. */
export type During = { workoutId: string; versionId: string | null };

/**
 * A run still going on `today`, or null once it is over (finished or left). One whose version this app
 * can't read is unavailable until it is left. `during` a session (its Done page, before you tap Done):
 * its open workout counts as if it were Done, and the run reads as the version the session started on,
 * whatever was edited since.
 */
function yours(
  library: Library,
  run: Library['runs'][number],
  today: Day,
  during?: During,
): Yours | null {
  const challenge = library.challenges.find(({ id }) => id === run.challengeId);
  if (!challenge) return null;
  const rows = library.versions.filter((v) => v.challengeId === challenge.id);
  const row = rows.find(({ id }) => id === (during?.versionId ?? versionOf(run, challenge)));
  const version = row && readVersion(row);
  if (!version) {
    const name = row?.name ?? '';
    return run.endedOn ? null : { challengeId: challenge.id, runId: run.id, name, challenge: null };
  }
  const versions = rows.flatMap((v) => readVersion(v) ?? []);
  // Tries under a version this app can't read are left out: their plan can't be scored.
  const workouts = library.workouts.filter(
    (w) => w.runId === run.id && versions.some(({ id }) => id === w.versionId),
  );
  const sets = readSets(library.sets);
  const input = { run, version, versions, workouts, sets };
  const { days, state } = runCalendar(during ? counting(input, during.workoutId) : input, today);
  if (state.state !== 'active') return null;
  const stretch = days.filter(({ from }) => from === state.from);
  return {
    challengeId: challenge.id,
    runId: run.id,
    challenge: version,
    run: {
      id: run.id,
      day: state.day,
      days: version.days,
      from: state.from,
      progress: stretch.map(({ result }) => result.share),
    },
    amounts: stretch.map(({ result }) => amountsOn(version, result, sets)),
  };
}

/** A run by id, while it is still going; `during` as in `yours`. */
export function runById(library: Library, runId: string, today: Day, during?: During) {
  const run = library.runs.find(({ id }) => id === runId);
  return run ? yours(library, run, today, during) : null;
}

const order = (entry: Yours) => (!entry.challenge ? 2 : doneToday(entry.run) ? 1 : 0);

/** Every run still going: due today first, then done today, then those needing an app update. */
export const yourRuns = (library: Library, today: Day) =>
  library.runs
    .flatMap((run) => yours(library, run, today) ?? [])
    .sort((a, b) => order(a) - order(b));

const current = (library: Library, challenge: Library['challenges'][number]) => {
  const row = library.versions.find(({ id }) => id === challenge.currentVersionId);
  return row ? readVersion(row) : null;
};

/** Ours you aren't running, in catalog order. */
export function catalog(library: Library, running: readonly Yours[]): CatalogEntry[] {
  return SUGGESTED_CHALLENGES.flatMap(({ id }) => {
    const row = library.challenges.find((c) => c.id === id);
    const version = row && !row.retiredAt && current(library, row);
    const busy = running.some(({ challengeId }) => challengeId === id);
    return version && !busy ? [toEntry(id, version)] : [];
  });
}

/**
 * A challenge as its page shows it, with one of your runs: `runId`'s (none if that run is over: a stale
 * link never shows another run), or without `runId` the latest still going. `challenge` is that run's version (never another one), else the current version; null when
 * this app can't run it. Only a one-exercise challenge you made is `editable`.
 */
export function challengePage(library: Library, id: string, today: Day, runId?: string) {
  const row = library.challenges.find((c) => c.id === id);
  if (!row) return null;
  const runs = library.runs.filter((run) => run.challengeId === id);
  const going = runs.flatMap((run) => yours(library, run, today) ?? []);
  const mine =
    runId === undefined
      ? (going.at(-1) ?? null)
      : (going.find((entry) => entry.runId === runId) ?? null);
  const challenge = mine ? mine.challenge : current(library, row);
  const length = challenge?.days === 1 ? 'ONE GO' : `${challenge?.days} DAYS · DAY 1 IS TODAY`;
  return {
    name:
      mine?.challenge === null
        ? mine.name
        : (library.versions.find((v) => v.id === row.currentVersionId)?.name ?? ''),
    challenge,
    /** Your run on this page; with `challenge` null it needs an app update. */
    runId: mine?.runId ?? null,
    joined: mine?.challenge ? mine : null,
    ranBefore: runs.length > 0,
    editable: row.owner === userId() && challenge !== null && draftOf(challenge) !== null,
    /** The line under the title before you join. */
    status: `${row.owner === OURS ? 'SUGGESTED · ' : ''}${length}`,
  };
}

const FREE_LOG: LogTarget = { runId: null, versionId: null };

/**
 * What a workout runs: an exercise id is one go at it (a free log), any other id one of your runs, on
 * its version, as it stands on `day`; no challenge when the run is over or needs an app update. `target`
 * is what the workout counts toward; `during` as in `yours`.
 */
export function sessionChallenge(library: Library, id: string, day: Day, during?: During) {
  const exercise = ONE_GO.find((one) => one === id);
  if (exercise) return { challenge: oneGo(exercise), run: null, target: FREE_LOG };
  const entry = runById(library, id, day, during);
  const joined = entry?.challenge ? entry : null;
  return {
    challenge: joined?.challenge ?? null,
    run: joined?.run ?? null,
    target: { runId: id, versionId: joined?.challenge.id ?? null },
  };
}
