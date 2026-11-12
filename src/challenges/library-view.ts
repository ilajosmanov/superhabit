import { toEntry, type CatalogEntry } from './catalog';
import { ONE_GO, oneGo } from './one-go';
import { draftOf } from './draft';
import { isHold } from './hold';
import { counting, runCalendar, versionOf, type DayResult, type Version } from './progress';
import { doneToday, restingToday, type RunView } from './run-view';
import { OURS, SUGGESTED_CHALLENGES } from './suggested';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { capitalise } from '@/lib/text';
import type { Account } from '@/storage/account';
import type { Sharing } from '@/storage/consent';
import type * as schema from '@/storage/schema';
import type { Day } from '@/lib/day';
import { isRestDay } from '@/workout/plan/schedule';
import { readSets, type LoggedSet } from '@/workout/plan/logged-set';
import type { LogTarget } from '@/workout/store';
import { expand, readChallengePlan, type FlatSteps } from '@/workout/plan/plan';
import { countedWorkouts, setAmounts, workoutResults } from '@/workout/plan/results';

/** The library's rows as the screens read them. */
export type Library = {
  /** Who is signed in: what you own, and your name and photo. */
  account: Account;
  /** Your answer to sharing traces, as kept here; whether it is in force is the account's rule (`shares`). */
  sharing: Sharing | null;
  challenges: readonly (typeof schema.challenges.$inferSelect)[];
  versions: readonly (typeof schema.challengeVersions.$inferSelect)[];
  runs: readonly (typeof schema.runs.$inferSelect)[];
  workouts: readonly (typeof schema.workouts.$inferSelect)[];
  sets: readonly Omit<typeof schema.sets.$inferSelect, 'attempts' | 'metrics' | 'counterVersion'>[];
};

/** A version this app can run; it is also the `Challenge` the plan, cards and session take. */
type Readable = Version & { name: string };

export type Joined = {
  challengeId: string;
  runId: string;
  /** The version the run follows. */
  challenge: Readable;
  run: RunView;
  /**
   * What each exercise set got on each day of `progress`, on the try the day shows (a daily total: the
   * day's sum), against the version that try was done on; nothing done on a day with no try. `sets`: the
   * kept sets the day shows (`DayResult.sets`), whose videos the page plays.
   */
  amounts: readonly { version: Readable; done: readonly number[]; sets: readonly LoggedSet[] }[];
};
/** A run whose version is from a newer app: shown with "Update the app", never with another version. */
export type Unavailable = { challengeId: string; runId: string; name: string; challenge: null };
export type Yours = Joined | Unavailable;

/** Null for a plan from a newer app (an exercise or shape this one doesn't know). */
function readVersion(row: Library['versions'][number]): Readable | null {
  const plan = readChallengePlan(row.plan, row.days);
  const { id, name, days, dailyTotal, restartOnMiss } = row;
  return plan && { id, name, days, dailyTotal, restartOnMiss, ...plan };
}

function amountsOn(
  versions: readonly Readable[],
  version: Readable,
  { shown, total, sets: day }: DayResult,
  sets: readonly LoggedSet[],
) {
  // An edit never rescores a try: it reads against the version it was done on.
  const at = versions.find(({ id }) => id === shown?.versionId) ?? version;
  if (total !== undefined) return { version: at, done: [total], sets: day };
  const steps = expand(at.session);
  const done = setAmounts(steps, workoutResults(steps, shown?.id ?? '', sets));
  return { version: at, done, sets: day };
}

/** The library with its stored JSON read once: every version's plan, every set. */
const read = (library: Library) => ({
  library,
  versions: library.versions.map((row) => ({ row, version: readVersion(row) })),
  sets: readSets(library.sets),
});
type Read = ReturnType<typeof read>;

/**
 * A run's challenge, the version it follows (`wanted`, else its own; null when this app can't read it)
 * and what its calendar reads: every readable version, and its tries under them (a try under a version
 * this app can't read is left out: its plan can't be scored).
 */
function runInput(
  { library, ...stored }: Read,
  run: Library['runs'][number],
  wanted?: string | null,
) {
  const challenge = library.challenges.find(({ id }) => id === run.challengeId);
  if (!challenge) return null;
  const rows = stored.versions.filter(({ row }) => row.challengeId === challenge.id);
  const found = rows.find(({ row }) => row.id === (wanted ?? versionOf(run, challenge)));
  const versions = rows.flatMap((v) => v.version ?? []);
  const workouts = library.workouts.filter(
    (w) => w.runId === run.id && versions.some(({ id }) => id === w.versionId),
  );
  return {
    challenge,
    found,
    version: found?.version ?? null,
    versions,
    input: { run, versions, workouts, sets: stored.sets },
  };
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
  { library, ...stored }: Read,
  run: Library['runs'][number],
  today: Day,
  during?: During,
): Yours | null {
  const at = runInput({ library, ...stored }, run, during?.versionId);
  if (!at) return null;
  const { challenge, found, version, versions, input } = at;
  // Archiving stops every run, including one synced later from an offline phone, without erasing history.
  if (challenge.retiredAt !== null) return null;
  if (!version) {
    const name = found?.row.name ?? '';
    return run.endedOn ? null : { challengeId: challenge.id, runId: run.id, name, challenge: null };
  }
  const { sets } = stored;
  const { days, state } = runCalendar(
    during ? counting({ ...input, version }, during.workoutId) : { ...input, version },
    today,
  );
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
      ...(version.schedule && {
        restDays: version.schedule.flatMap((day, i) => (day === 'rest' ? [i] : [])),
      }),
    },
    amounts: stretch.map(({ result }) => amountsOn(versions, version, result, sets)),
  };
}

/** A run by id, while it is still going; `during` as in `yours`. */
function runById(library: Library, runId: string, today: Day, during?: During) {
  const run = library.runs.find(({ id }) => id === runId);
  return run ? yours(read(library), run, today, during) : null;
}

const order = (entry: Yours) =>
  !entry.challenge ? 2 : doneToday(entry.run) || restingToday(entry.run) ? 1 : 0;

/** Every run still going: due today first, then done today, then those needing an app update. */
export function yourRuns(library: Library, today: Day) {
  const stored = read(library);
  return library.runs
    .flatMap((run) => yours(stored, run, today) ?? [])
    .sort((a, b) => order(a) - order(b));
}

const current = (library: Library, challenge: Library['challenges'][number]) => {
  const row = library.versions.find(({ id }) => id === challenge.currentVersionId);
  return row ? readVersion(row) : null;
};

/**
 * Ours you aren't running, in catalog order, then the ones you made that you aren't running: once you leave
 * or finish your own, this is where it stays.
 */
export function catalog(library: Library, running: readonly Yours[]): CatalogEntry[] {
  const made = library.challenges.filter(({ owner }) => owner === library.account.id);
  return [...SUGGESTED_CHALLENGES, ...made].flatMap(({ id }) => {
    const row = library.challenges.find((c) => c.id === id);
    const version = row && row.retiredAt === null && current(library, row);
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
  const stored = read(library);
  const going = runs.flatMap((run) => yours(stored, run, today) ?? []);
  const mine =
    runId === undefined
      ? (going.at(-1) ?? null)
      : (going.find((entry) => entry.runId === runId) ?? null);
  const challenge = mine ? mine.challenge : current(library, row);
  const length = challenge?.days === 1 ? 'ONE GO' : `${challenge?.days} DAYS · DAY 1 IS TODAY`;
  const archived = row.retiredAt !== null;
  return {
    name: mine?.challenge
      ? mine.challenge.name
      : (mine?.name ?? library.versions.find(({ id }) => id === row.currentVersionId)?.name ?? ''),
    challenge,
    guidance: SUGGESTED_CHALLENGES.find(({ versionId }) => versionId === challenge?.id),
    /** Your run on this page; with `challenge` null it needs an app update. */
    runId: mine?.runId ?? null,
    joined: mine?.challenge ? mine : null,
    ranBefore: runs.length > 0,
    archived,
    archivable: row.owner === library.account.id && !archived,
    editable:
      row.owner === library.account.id &&
      !archived &&
      challenge !== null &&
      draftOf(challenge) !== null,
    /** Ours: its numbers can change before you join (Your numbers). */
    suggested: row.owner === OURS,
    /** The line under the title before you join. */
    status: archived ? 'ARCHIVED' : `${row.owner === OURS ? 'SUGGESTED · ' : ''}${length}`,
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
    challenge: joined && !isRestDay(joined.challenge, joined.run.day) ? joined.challenge : null,
    run: joined?.run ?? null,
    target: { runId: id, versionId: joined?.challenge.id ?? null },
  };
}

/** A saved workout as Home lists it under its day. */
export type LogRow = {
  workoutId: string;
  /** The challenge's name on the version the try was done on, or the exercise of one go. */
  name: string;
  exercises: readonly ExerciseId[];
  startedAt: number;
  /** The phone's offset from UTC when it started, so its time reads as it was where you were. */
  tzOffsetMin: number;
  /** One go at an exercise (a free log), not a challenge's try. */
  free: boolean;
  /** Which day of its run it was; null for one go, or a version this app can't read. */
  runDay: { number: number; of: number } | null;
  reps: number;
  heldMs: number;
  /** Holds only: what it got is time, not reps. */
  held: boolean;
  /** Its plan's steps, which the reel needs; null for a version this app can't read. */
  steps: FlatSteps | null;
  sets: readonly LoggedSet[];
};

/**
 * `day`'s saved workouts that counted a rep or hold, oldest first, each with
 * what it got and the plan its reel plays by.
 */
export function dayLog(library: Library, day: Day, today: Day): LogRow[] {
  const shown = countedWorkouts(library.workouts, library.sets)
    .filter((w) => w.day === day)
    .sort((a, b) => a.startedAt - b.startedAt);
  if (shown.length === 0) return [];
  // Read only what the rows need: their own sets, and every set of their runs for the runs' calendars.
  const runIds = new Set(shown.flatMap(({ runId }) => runId ?? []));
  const needed = new Set(
    library.workouts
      .filter((w) => shown.includes(w) || (w.runId !== null && runIds.has(w.runId)))
      .map(({ id }) => id),
  );
  const stored = read({
    ...library,
    sets: library.sets.filter((set) => needed.has(set.workoutId)),
  });
  // One calendar per run, numbered as the run's page numbers it: on the run's version, restarts included.
  const calendars = new Map<string, ReturnType<typeof runCalendar> | null>();
  const calendarOf = (run: Library['runs'][number]) => {
    if (!calendars.has(run.id)) {
      const at = runInput(stored, run);
      calendars.set(
        run.id,
        at?.version ? runCalendar({ ...at.input, version: at.version }, today) : null,
      );
    }
    return calendars.get(run.id) ?? null;
  };
  return shown.map((workout) => {
    const sets = stored.sets
      .filter((set) => set.workoutId === workout.id)
      .sort((a, b) => a.startedAt - b.startedAt);
    const exercises = [...new Set(sets.map((set) => set.exercise))];
    const base = {
      workoutId: workout.id,
      exercises,
      startedAt: workout.startedAt,
      tzOffsetMin: workout.tzOffsetMin,
      reps: sets.reduce((sum, set) => sum + set.reps, 0),
      heldMs: sets.reduce((sum, set) => sum + set.heldMs, 0),
      held: exercises.length > 0 && exercises.every(isHold),
      sets,
    };
    const run = library.runs.find(({ id }) => id === workout.runId);
    if (!run) {
      const exercise = exercises.at(0);
      return {
        ...base,
        name: exercise ? capitalise(EXERCISES[exercise].name) : '',
        free: true,
        runDay: null,
        steps: exercise ? expand(oneGo(exercise).session) : null,
      };
    }
    const tried = stored.versions.find(({ row }) => row.id === workout.versionId);
    const calendar = calendarOf(run);
    const number = calendar?.days.find((d) => d.day === day)?.number;
    return {
      ...base,
      name: tried?.row.name ?? '',
      free: false,
      runDay: number && tried?.version ? { number, of: tried.version.days } : null,
      steps: tried?.version ? expand(tried.version.session) : null,
    };
  });
}
