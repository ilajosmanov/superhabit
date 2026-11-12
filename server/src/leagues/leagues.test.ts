import { is } from 'drizzle-orm';
import { SQLiteUpdateBase } from 'drizzle-orm/sqlite-core';
import { describe, expect, it, vi } from 'vite-plus/test';

import { open } from '../db/db';
import { push } from '../__fixtures__/outbox';
import { call, env, passedBeforeLimit, someone } from '../__fixtures__/worker';
import { board, closeWeek, weekOf } from './store';

const db = open(env);
// The week of Monday 2 Nov 2026; Wednesday at 10:00 UTC.
const WEEK = '2026-11-02';
const WEDNESDAY = Date.parse('2026-11-04T10:00:00Z');
let workouts = 0;
/** A done workout of squats on `day`, ten to a set's goal, synced as the phone sends it. */
async function squats(cookie: string, reps: number[], endedAt = WEDNESDAY, day = '2026-11-04') {
  const id = `league-workout-${++workouts}`;
  const result = await push(cookie, [
    {
      entity: 'workout',
      entityId: id,
      op: 'done',
      payload: {
        workout: {
          id,
          runId: null,
          versionId: null,
          day,
          startedAt: endedAt - 60_000,
          endedAt,
          tzOffsetMin: 0,
          tz: 'Europe/London',
          appVersion: '1.0.0',
          sets: reps.map((n, planStep) => ({
            id: `${id}-set-${planStep}`,
            workoutId: id,
            planStep,
            exercise: 'squat',
            goal: { type: 'reps', n: 10 },
            reps: n,
            noReps: 0,
            heldMs: 0,
            startedAt: endedAt - 30_000,
            endedAt,
            counterVersion: '1.1.0',
            attempts: [],
            metrics: null,
          })),
        },
      },
    },
  ]);
  expect(result).toEqual({ results: [{ ok: true }] });
}

/** Where each of `people` stands in `week`, by rank: [who, league, points, move]. */
async function places(week: string, people: { id: string }[]) {
  const { results } = await env.DB.prepare(
    'select user_id, league, points, rank, move from league_weeks where week = ? and user_id in (select value from json_each(?))',
  )
    .bind(week, JSON.stringify(people.map((p) => p.id)))
    .all<{
      user_id: string;
      league: string;
      points: number | null;
      rank: number | null;
      move: string | null;
    }>();
  // Before the close there are no ranks: by who they are.
  return results
    .map((r) => ({ ...r, who: people.findIndex((p) => p.id === r.user_id) }))
    .sort((x, y) => Number(x.rank) - Number(y.rank) || x.who - y.who)
    .map((r) => [r.who, r.league, r.points, r.move]);
}

const show = (cookie: string, visible: unknown) =>
  call('/leaderboard/visibility', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ visible }),
  });

describe('leagues', () => {
  it('shows your board with live points; others are nameless until they choose to be seen', async () => {
    await closeWeek(db, '2026-10-26');
    const ann = await someone('Ann Marie Lee');
    const bob = await someone('Bob');
    await squats(ann.cookie, [10, 5]);
    await squats(bob.cookie, [10]);
    // Out of the week: the Monday after, at midnight.
    await squats(ann.cookie, [10], Date.parse('2026-11-09T00:00:00Z'), '2026-11-09');

    const before = await board(db, ann.id, WEDNESDAY);
    // Both are new: on the same Bronze board, with no week behind them.
    expect(before).toMatchObject({ week: WEEK, league: 'bronze', visible: null, last: null });
    expect((await board(db, bob.id, WEDNESDAY))?.rows).toEqual([
      { rank: 1, you: false, name: null, image: null, points: 15 },
      { rank: 2, you: true, name: 'Bob', image: expect.any(String), points: 10 },
    ]);
    expect(before?.rows[0]).toMatchObject({ you: true, name: 'Ann L.', points: 15 });

    expect((await show(ann.cookie, true)).status).toBe(204);
    expect((await board(db, bob.id, WEDNESDAY))?.rows[0]).toMatchObject({ name: 'Ann L.' });
    await show(ann.cookie, false);
    expect((await board(db, bob.id, WEDNESDAY))?.rows[0]).toMatchObject({
      name: null,
      image: null,
    });
    expect((await show(ann.cookie, 'yes')).status).toBe(400);

    // Deleted: gone from the board at once.
    await call('/account', { method: 'DELETE', headers: { cookie: ann.cookie } });
    expect((await board(db, bob.id, WEDNESDAY))?.rows).toHaveLength(1);
  });

  it('settles last week before anyone new joins this one; who scored goes on, who didn’t starts where they were', async () => {
    await closeWeek(db, '2026-08-31');
    const week = '2026-09-07';
    const tuesday = Date.parse('2026-09-08T08:00:00Z');
    const crew = await Promise.all(Array.from({ length: 4 }, () => someone()));
    // 4 on a board: 1 moves up. One looked but never trained.
    for (const [i, { cookie }] of crew.slice(0, 3).entries()) {
      await squats(cookie, [10 - i], tuesday, '2026-09-08');
    }
    await board(db, crew[3].id, tuesday);

    // Just past Monday midnight, before the Cron closes last week: nobody new is placed yet.
    const nextMonday = Date.parse('2026-09-14T00:00:01Z');
    expect(await board(db, crew[0].id, nextMonday)).toBeNull();

    await closeWeek(db, week);
    expect(await places(week, crew)).toEqual([
      [0, 'bronze', 10, 'up'],
      [1, 'bronze', 9, 'stay'],
      [2, 'bronze', 8, 'stay'],
      [3, 'bronze', 0, 'stay'],
    ]);
    expect(await places('2026-09-14', crew)).toEqual([
      [0, 'silver', null, null],
      [1, 'bronze', null, null],
      [2, 'bronze', null, null],
    ]);
    expect(await board(db, crew[3].id, nextMonday)).toMatchObject({ league: 'bronze' });
  });

  it('moves the top up only if they scored, and the bottom of Silver down', async () => {
    const [a, b] = ['2026-08-03', '2026-08-10'];
    const crew = await Promise.all(Array.from({ length: 12 }, () => someone()));
    // 12 on a Bronze board: up to 4 move up, but only 3 scored.
    for (const [i, { cookie }] of crew.slice(0, 3).entries()) {
      await squats(cookie, [10 - i], Date.parse('2026-08-04T08:00:00Z'), '2026-08-04');
    }
    await closeWeek(db, '2026-07-27');
    for (const { id } of crew.slice(3)) await board(db, id, Date.parse('2026-08-04T09:00:00Z'));
    // The nine who looked share a board (the three who trained join it at the close): three places could
    // move up, but nobody on it has points.
    expect(await board(db, crew[3].id, Date.parse('2026-08-04T09:00:00Z'))).toMatchObject({
      zone: 3,
      up: 0,
    });
    await closeWeek(db, a);
    expect((await places(a, crew)).slice(0, 4)).toEqual([
      [0, 'bronze', 10, 'up'],
      [1, 'bronze', 9, 'up'],
      [2, 'bronze', 8, 'up'],
      // Fourth, with no points: stays.
      [expect.any(Number), 'bronze', 0, 'stay'],
    ]);

    // The three in Silver: 1 moves each way.
    await squats(crew[0].cookie, [10, 10], Date.parse('2026-08-11T08:00:00Z'), '2026-08-11');
    await squats(crew[1].cookie, [10], Date.parse('2026-08-11T08:00:00Z'), '2026-08-11');
    await closeWeek(db, b);
    expect(await places(b, crew)).toEqual([
      [0, 'silver', 20, 'up'],
      [1, 'silver', 10, 'stay'],
      [2, 'silver', 0, 'down'],
    ]);
    expect(await places('2026-08-17', crew)).toEqual([
      [0, 'gold', null, null],
      [1, 'silver', null, null],
    ]);
    // The week after, each sees how theirs closed: where they were, their place, their points.
    const monday = Date.parse('2026-08-17T09:00:00Z');
    expect(await board(db, crew[0].id, monday)).toMatchObject({
      league: 'gold',
      // Alone on a board: nobody moves.
      zone: 0,
      last: { week: b, league: 'silver', rank: 1, points: 20 },
    });
    expect(await board(db, crew[2].id, monday)).toMatchObject({
      league: 'bronze',
      last: { week: b, league: 'silver', rank: 3, points: 0 },
    });
  });

  it('puts whoever trained on a board when the week closes, and nobody after it has', async () => {
    const quiet = await someone();
    const late = await someone();
    const week = '2026-07-06';
    await squats(quiet.cookie, [10], Date.parse('2026-07-12T23:59:59Z'), '2026-07-12');
    await closeWeek(db, week);
    // Synced on Tuesday, for Sunday: the week has closed without it.
    await squats(late.cookie, [10], Date.parse('2026-07-12T22:00:00Z'), '2026-07-12');
    await closeWeek(db, week);
    expect(await places(week, [quiet, late])).toEqual([[0, 'bronze', 10, 'stay']]);
    expect(await places('2026-07-13', [quiet, late])).toEqual([[0, 'bronze', null, null]]);

    // A week nobody trained in closes all the same; a late workout doesn't open it.
    const empty = '2026-05-04';
    await closeWeek(db, empty);
    await squats(late.cookie, [10], Date.parse('2026-05-06T08:00:00Z'), '2026-05-06');
    await closeWeek(db, empty);
    expect(await places(empty, [late])).toEqual([]);
  });

  it("scores a row it can't read as 0: the board still answers and the week still closes", async () => {
    const week = '2026-04-06';
    const crew = await Promise.all([someone(), someone()]);
    for (const { cookie } of crew) {
      await squats(cookie, [10], Date.parse('2026-04-07T08:00:00Z'), '2026-04-07');
    }
    // Kept by an older server: a day that isn't one.
    await env.DB.prepare("update workouts set day = '2026-99-99' where user_id = ?")
      .bind(crew[0].id)
      .run();
    await closeWeek(db, '2026-03-30');
    const wednesday = Date.parse('2026-04-08T08:00:00Z');
    await board(db, crew[0].id, wednesday);
    expect((await board(db, crew[1].id, wednesday))?.rows.map((r) => r.points)).toEqual([10, 0]);
    await closeWeek(db, week);
    expect(await places(week, crew)).toEqual([
      [1, 'bronze', 10, 'stay'],
      [0, 'bronze', 0, 'stay'],
    ]);
  });

  it('finishes a close that failed on one board, without letting anyone new in', async () => {
    const week = '2026-06-01';
    const crew = await Promise.all(Array.from({ length: 4 }, () => someone()));
    for (const { cookie } of crew.slice(0, 3)) {
      await squats(cookie, [10], Date.parse('2026-06-02T08:00:00Z'), '2026-06-02');
    }
    // Two boards: the first two people on one, the third on another.
    for (const [i, { id }] of crew.slice(0, 3).entries()) {
      await env.DB.prepare(
        "insert into league_weeks (user_id, week, league, cohort) values (?, ?, 'bronze', ?)",
      )
        .bind(id, week, i < 2 ? 0 : 1)
        .run();
    }
    // The first board's results fail to save.
    const batch = db.batch.bind(db);
    let failed = false;
    const spy = vi.spyOn(db, 'batch').mockImplementation((statements) => {
      if (!failed && is(statements[0], SQLiteUpdateBase)) {
        failed = true;
        return Promise.reject(new Error('D1 is down'));
      }
      return batch(statements);
    });
    await expect(closeWeek(db, week)).rejects.toThrow(AggregateError);
    spy.mockRestore();
    // The other board closed and its scorer went on; the week isn't closed, so nobody new joins next week.
    expect((await places(week, crew)).filter(([, , , move]) => move === null)).toHaveLength(2);
    expect(await places('2026-06-08', crew)).toHaveLength(1);
    expect(await board(db, crew[3].id, Date.parse('2026-06-09T08:00:00Z'))).toBeNull();

    // Before the retry, a late sync for that week: it stays out.
    await squats(crew[3].cookie, [10], Date.parse('2026-06-03T08:00:00Z'), '2026-06-03');
    await closeWeek(db, week);
    expect((await places(week, crew)).map(([who, , points]) => [who, points])).toEqual(
      expect.arrayContaining([
        [0, 10],
        [1, 10],
        [2, 10],
      ]),
    );
    expect(await places(week, crew)).toHaveLength(3);
    expect(await places('2026-06-08', crew)).toHaveLength(3);
    expect(await board(db, crew[3].id, Date.parse('2026-06-09T08:00:00Z'))).toMatchObject({
      league: 'bronze',
    });
  });

  it('names a week by its Monday, which starts at midnight UTC', () => {
    expect(weekOf(WEDNESDAY)).toBe(WEEK);
    expect(weekOf(Date.parse('2026-11-08T23:59:59Z'))).toBe(WEEK);
    expect(weekOf(Date.parse('2026-11-09T00:00:00Z'))).toBe('2026-11-09');
  });

  it('answers 60 board reads a minute from one account', async () => {
    const { cookie } = await someone();
    const read = async () => (await call('/leaderboard', { headers: { cookie } })).status;
    const passed = await passedBeforeLimit(read, 60);
    expect(passed).toBeGreaterThanOrEqual(60);
    expect(passed).toBeLessThanOrEqual(120);
    // Up to 120 real requests: well past the default 5 s on a slow run.
  }, 20_000);
});
