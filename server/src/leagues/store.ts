import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
} from 'drizzle-orm';

import { readSets } from '@/workout/plan/logged-set';
import { restDays } from '@/challenges/rest-days';
import { SUGGESTED_CHALLENGES, SUGGESTED_HISTORY } from '@/challenges/suggested';
import { storedPlan } from '@/workout/plan/plan';
import { aliveDays } from '@/streak/streak';

import type { Db } from '../db/db';
import {
  challenges,
  challengeVersions,
  runs,
  deletions,
  leaderboardChoices,
  leagueCloses,
  leagueWeeks,
  sets,
  streakEvents,
  user,
  workouts,
} from '../db/schema';
import { addDays, RATES, STREAK_BONUS, STREAK_CAP, weekPoints } from './points';

export type League = (typeof leagueWeeks.$inferSelect)['league'];
type Move = NonNullable<(typeof leagueWeeks.$inferSelect)['move']>;
const LEAGUES: League[] = ['bronze', 'silver', 'gold'];
/** People on one board. The app's rules say it (src/leaderboard/components/your-place.tsx). */
const COHORT = 30;
/** The most who move up, and down, from one board. The app's rules say it too (your-place.tsx). */
const MOVE = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The week holding `now`, named by its Monday (UTC). Weeks close at Monday 00:00 UTC. */
export function weekOf(now: number) {
  const date = new Date(now);
  return addDays(date.toISOString().slice(0, 10), -((date.getUTCDay() + 6) % 7));
}
const startOf = (week: string) => Date.parse(`${week}T00:00:00Z`);

/** How many places at each end of a board of `n` can move: `min(5, n/3)`. */
const zoneOf = (n: number) => Math.min(MOVE, Math.floor(n / 3));

/**
 * Where the one at index `i` of a board of `n`, ranked best first, goes when the week closes: the top
 * `min(5, n/3)` up if they scored, as many at the bottom down; never above Gold or below Bronze.
 */
function moveOf(i: number, n: number, points: number, league: League): Move {
  const k = zoneOf(n);
  if (i < k && points > 0 && league !== 'gold') return 'up';
  if (i >= n - k && league !== 'bronze') return 'down';
  return 'stay';
}

const shifted = (league: League, move: Move | null) =>
  LEAGUES[
    Math.min(
      Math.max(LEAGUES.indexOf(league) + (move === 'up' ? 1 : move === 'down' ? -1 : 0), 0),
      2,
    )
  ];

type Board = { week: string; league: League; cohort: number };

/**
 * The points of each of a board's `members` in its week, from the sets synced so far that ended in it (by
 * the phone's clock). The streak bonus reads the days they trained or froze, back far enough for its cap.
 * The board is read in the query, not bound id by id, so its size doesn't meet D1's 100 values.
 */
async function pointsOf(db: Db, { week, league, cohort }: Board, members: string[]) {
  const onBoard = db
    .select({ userId: leagueWeeks.userId })
    .from(leagueWeeks)
    .where(
      and(
        eq(leagueWeeks.week, week),
        eq(leagueWeeks.league, league),
        eq(leagueWeeks.cohort, cohort),
      ),
    );
  const from = startOf(week);
  const [scored, recorded, historySets, frozen, custom, versions, participations] = await db.batch([
    db
      .select({
        userId: sets.userId,
        day: workouts.day,
        exercise: sets.exercise,
        goal: sets.goal,
        reps: sets.reps,
        heldMs: sets.heldMs,
      })
      .from(sets)
      .innerJoin(workouts, and(eq(workouts.userId, sets.userId), eq(workouts.id, sets.workoutId)))
      .where(
        and(
          inArray(sets.userId, onBoard),
          gte(sets.endedAt, from),
          lt(sets.endedAt, from + WEEK_MS),
        ),
      ),
    // Recovery can separate training days by more than the bonus cap's calendar lookback.
    // shortcut: every member's whole history on each board read (~30 people); bound it by the runs that
    // overlap the week once histories reach years, which needs the rest-day lookback spelled out first.
    db
      .select({
        userId: workouts.userId,
        id: workouts.id,
        runId: workouts.runId,
        versionId: workouts.versionId,
        day: workouts.day,
        startedAt: workouts.startedAt,
        tz: workouts.tz,
      })
      .from(workouts)
      .where(inArray(workouts.userId, onBoard)),
    db
      .select({
        userId: sets.userId,
        id: sets.id,
        workoutId: sets.workoutId,
        planStep: sets.planStep,
        exercise: sets.exercise,
        goal: sets.goal,
        reps: sets.reps,
        heldMs: sets.heldMs,
        startedAt: sets.startedAt,
        endedAt: sets.endedAt,
      })
      .from(sets)
      .where(inArray(sets.userId, onBoard)),
    db
      .select({ userId: streakEvents.userId, day: streakEvents.day })
      .from(streakEvents)
      .where(and(inArray(streakEvents.userId, onBoard), eq(streakEvents.kind, 'used'))),
    db.select().from(challenges).where(inArray(challenges.userId, onBoard)),
    db.select().from(challengeVersions).where(inArray(challengeVersions.userId, onBoard)),
    db.select().from(runs).where(inArray(runs.userId, onBoard)),
  ]);
  return new Map(
    members.map((id) => {
      const scoredSets = scored.filter((set) => set.userId === id);
      if (scoredSets.length === 0) return [id, 0] as const;
      const workouts = recorded
        .filter((row) => row.userId === id)
        .map((row) => ({ ...row, status: 'done' as const }));
      const sets = readSets(historySets.filter((row) => row.userId === id));
      let rest = new Set<string>();
      try {
        rest = new Set(
          restDays(
            {
              challenges: [
                ...SUGGESTED_CHALLENGES.map((entry) => ({
                  id: entry.id,
                  currentVersionId: entry.versionId,
                  retiredAt: null,
                })),
                ...custom.filter((row) => row.userId === id),
              ],
              versions: [
                ...[...SUGGESTED_HISTORY, ...SUGGESTED_CHALLENGES].map((entry, number) => ({
                  id: entry.versionId,
                  challengeId: entry.id,
                  number,
                  createdAt: 0,
                  ...entry.challenge,
                  plan: storedPlan(entry.challenge),
                })),
                ...versions.filter((row) => row.userId === id),
              ],
              runs: participations.filter((row) => row.userId === id),
              workouts,
              sets,
            },
            addDays(week, 7),
          ),
        );
      } catch (error) {
        // One member's unreadable history must not fail the board: score them without recovery credit.
        console.error('rest days failed for a board member', error);
      }
      const kept = new Set([
        ...aliveDays(workouts, sets),
        ...frozen.filter((row) => row.userId === id && !rest.has(row.day)).map((row) => row.day),
      ]);
      return [id, weekPoints(scoredSets, kept, rest)] as const;
    }),
  );
}

/** The league each person starts `week` in: where their latest earlier week left them, or Bronze. */
function startingLeagues(
  people: string[],
  history: (typeof leagueWeeks.$inferSelect)[],
  week: string,
) {
  return people.map((userId) => {
    const last = history
      .filter((row) => row.userId === userId && row.week < week)
      .sort((a, b) => b.week.localeCompare(a.week))[0];
    return { userId, league: last ? shifted(last.league, last.move) : 'bronze' };
  });
}

const closed = (db: Db, week: string) =>
  db.select().from(leagueCloses).where(eq(leagueCloses.week, week));

/** Puts people on a week's boards: each joins the emptiest board of their league with room, or a new one. */
// shortcut: counts and inserts aren't one transaction, so people placed at the same moment can push a board
// past 30. Harmless at our size; place with one INSERT … SELECT if boards fill up.
async function place(db: Db, week: string, people: { userId: string; league: League }[]) {
  if (people.length === 0) return;
  const boards = await db
    .select({ league: leagueWeeks.league, cohort: leagueWeeks.cohort, n: count() })
    .from(leagueWeeks)
    .where(eq(leagueWeeks.week, week))
    .groupBy(leagueWeeks.league, leagueWeeks.cohort);
  const rows = people
    .map((person) => ({ person, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ person: { userId, league } }) => {
      const ours = boards.filter((b) => b.league === league);
      let board = ours.filter((b) => b.n < COHORT).sort((a, b) => a.n - b.n)[0];
      if (!board) {
        board = { league, cohort: Math.max(-1, ...ours.map((b) => b.cohort)) + 1, n: 0 };
        boards.push(board);
      }
      board.n++;
      return { userId, week, league, cohort: board.cohort };
    });
  // D1 binds at most 100 values a statement: 4 a row.
  for (let i = 0; i < rows.length; i += 25)
    await db
      .insert(leagueWeeks)
      .values(rows.slice(i, i + 25))
      .onConflictDoNothing();
}

/** Everyone who trained in `week` and has no board yet (deleted accounts aside) gets one. */
export async function placeTrainers(db: Db, week: string) {
  const from = startOf(week);
  const trainers = db
    .selectDistinct({ userId: sets.userId })
    .from(sets)
    .innerJoin(user, eq(user.id, sets.userId))
    .where(
      and(
        gte(sets.endedAt, from),
        lt(sets.endedAt, from + WEEK_MS),
        notInArray(
          sets.userId,
          db
            .select({ userId: leagueWeeks.userId })
            .from(leagueWeeks)
            .where(eq(leagueWeeks.week, week)),
        ),
      ),
    );
  // shortcut: reads every earlier week of each trainer to find their latest; fine while weeks are few, read
  // only the latest row per person once there are many.
  const [people, history] = await db.batch([
    trainers,
    db
      .select()
      .from(leagueWeeks)
      .where(and(lt(leagueWeeks.week, week), inArray(leagueWeeks.userId, trainers))),
  ]);
  await place(
    db,
    week,
    startingLeagues(
      people.map((p) => p.userId),
      history,
      week,
    ),
  );
}

/**
 * Closes a week that is over, once: places whoever trained without a board, ranks each board by its points,
 * moves the top up and the bottom down, puts everyone who scored on next week's boards, and records the
 * week closed, so a workout synced later doesn't reopen it. Each board closes in one transaction; a board
 * that fails doesn't stop the others, and the next run finishes what is left.
 */
export async function closeWeek(db: Db, week: string) {
  const [[done], [started]] = await db.batch([
    closed(db, week),
    db
      .select({ userId: leagueWeeks.userId })
      .from(leagueWeeks)
      .where(and(eq(leagueWeeks.week, week), isNotNull(leagueWeeks.move)))
      .limit(1),
  ]);
  if (done) return;
  // Once a board has closed, nobody joins one: a late arrival would close alone.
  if (!started) await placeTrainers(db, week);
  const open = await db
    .select({ userId: leagueWeeks.userId, league: leagueWeeks.league, cohort: leagueWeeks.cohort })
    .from(leagueWeeks)
    .innerJoin(user, eq(user.id, leagueWeeks.userId))
    .where(and(eq(leagueWeeks.week, week), isNull(leagueWeeks.move)));
  const failures: unknown[] = [];
  for (const members of Map.groupBy(open, (row) => `${row.league}:${row.cohort}`).values()) {
    const { league, cohort } = members[0];
    const ids = members.map((m) => m.userId);
    try {
      const points = await pointsOf(db, { week, league, cohort }, ids);
      const ranked = ids
        .map((userId) => ({ userId, points: points.get(userId) ?? 0 }))
        .sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
      const [first, ...rest] = ranked.map(({ userId, points }, i) =>
        db
          .update(leagueWeeks)
          .set({ points, rank: i + 1, move: moveOf(i, ranked.length, points, league) })
          .where(and(eq(leagueWeeks.userId, userId), eq(leagueWeeks.week, week))),
      );
      await db.batch([first, ...rest]);
    } catch (error) {
      failures.push(error);
    }
  }
  const scored = await db
    .select()
    .from(leagueWeeks)
    .where(and(eq(leagueWeeks.week, week), gt(leagueWeeks.points, 0)));
  const next = addDays(week, 7);
  await place(
    db,
    next,
    startingLeagues(
      scored.map((row) => row.userId),
      scored,
      next,
    ),
  );
  if (failures.length > 0) throw new AggregateError(failures, `closing ${week}`);
  await db.insert(leagueCloses).values({ week, closedAt: Date.now() }).onConflictDoNothing();
}

/** "Illia Osmanov" → "Illia O.": first name and the last name's initial. */
function shortName(name: string) {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? `${words[0]} ${words.at(-1)?.[0]}.` : words[0];
}

/**
 * Your board this week, placing you on one first. Others who chose to be seen show their name and photo;
 * the rest come back nameless. With it, how last week closed for you (`last`, null if you weren't on a
 * board), what each exercise scores (`rates`) and the streak bonus's rule (`bonus`). Null while last week is still closing: who goes where
 * isn't settled.
 */
export async function board(db: Db, userId: string, now: number) {
  const week = weekOf(now);
  const yours = () =>
    db
      .select()
      .from(leagueWeeks)
      .where(and(eq(leagueWeeks.userId, userId), eq(leagueWeeks.week, week)));
  let [mine] = await yours();
  if (!mine) {
    // Who goes where from last week isn't settled until it closes (the hourly Cron, just after midnight).
    const [lastClosed] = await closed(db, addDays(week, -7));
    if (!lastClosed) return null;
    const history = await db
      .select()
      .from(leagueWeeks)
      .where(and(eq(leagueWeeks.userId, userId), lt(leagueWeeks.week, week)))
      .orderBy(desc(leagueWeeks.week))
      .limit(1);
    await place(db, week, startingLeagues([userId], history, week));
    [mine] = await yours();
  }
  const lastWeek = addDays(week, -7);
  const [members, [choice], [last]] = await db.batch([
    db
      .select({
        userId: leagueWeeks.userId,
        name: user.name,
        image: user.image,
        visible: leaderboardChoices.visible,
      })
      .from(leagueWeeks)
      .innerJoin(user, eq(user.id, leagueWeeks.userId))
      .leftJoin(leaderboardChoices, eq(leaderboardChoices.userId, leagueWeeks.userId))
      .where(
        and(
          eq(leagueWeeks.week, week),
          eq(leagueWeeks.league, mine.league),
          eq(leagueWeeks.cohort, mine.cohort),
        ),
      ),
    visibility(db, userId),
    db
      .select()
      .from(leagueWeeks)
      .where(and(eq(leagueWeeks.userId, userId), eq(leagueWeeks.week, lastWeek))),
  ]);
  const points = await pointsOf(
    db,
    mine,
    members.map((m) => m.userId),
  );
  const ranked = members
    .map((m) => ({ ...m, points: points.get(m.userId) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
  const moves = ranked.map((m, i) => moveOf(i, ranked.length, m.points, mine.league));
  const rows = ranked.map((m, i) => {
    const you = m.userId === userId;
    const seen = you || m.visible === true;
    return {
      rank: i + 1,
      you,
      name: seen ? shortName(m.name) : null,
      image: seen ? m.image : null,
      points: m.points,
    };
  });
  return {
    week,
    endsAt: startOf(week) + WEEK_MS,
    league: mine.league,
    up: moves.filter((move) => move === 'up').length,
    down: moves.filter((move) => move === 'down').length,
    zone: zoneOf(ranked.length),
    visible: choice?.visible ?? null,
    rows,
    // How last week closed for you. Its board's size isn't kept: a deleted account leaves it.
    last:
      last && last.rank !== null
        ? { week: last.week, league: last.league, rank: last.rank, points: last.points ?? 0 }
        : null,
    rates: RATES,
    bonus: { perDay: STREAK_BONUS, days: STREAK_CAP },
  };
}

/** Whether you chose to be seen on the leaderboard; no row means hidden, not asked yet. */
const visibility = (db: Db, userId: string) =>
  db
    .select({ visible: leaderboardChoices.visible })
    .from(leaderboardChoices)
    .where(eq(leaderboardChoices.userId, userId));

export const chooseVisibility = (db: Db, userId: string, visible: boolean) =>
  db
    .insert(leaderboardChoices)
    .values({ userId, visible, chosenAt: Date.now() })
    .onConflictDoUpdate({
      target: leaderboardChoices.userId,
      set: { visible, chosenAt: Date.now() },
    });

/** Every deleted account's boards and choice. */
export function purgeLeagues(db: Db) {
  const deleted = db.select({ userId: deletions.userId }).from(deletions);
  return [leagueWeeks, leaderboardChoices].map((table) =>
    db.delete(table).where(inArray(table.userId, deleted)),
  );
}
