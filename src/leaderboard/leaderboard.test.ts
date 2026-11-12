import { createActor, waitFor } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import {
  asksVisibility,
  bonusOf,
  endsIn,
  lastWeekWords,
  leaderboard,
  standing,
  unseenClose,
  weekDay,
  type Board,
} from './leaderboard';
import { migrateDatabase } from '@/storage/__fixtures__/database';

// Our server and the network are faked; the machine is real.
const fake = vi.hoisted(() => ({ fetch: vi.fn(), reachable: vi.fn(() => true) }));
vi.mock('@/account/auth-client', () => ({ authClient: { $fetch: fake.fetch } }));
vi.mock('expo-file-system', () => ({}));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isInternetReachable: fake.reachable() }),
}));
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
// The app coming back to the front, as React Native tells it.
const app = vi.hoisted(() => ({ change: (_state: string) => {} }));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_type: string, listener: (state: string) => void) => {
      app.change = listener;
      return { remove: () => {} };
    },
  },
}));

const board = (visible: boolean | null, last: Board['last'] = null): Board => ({
  week: '2026-11-09',
  endsAt: Date.parse('2026-11-16T00:00:00Z'),
  league: 'bronze',
  up: 1,
  down: 0,
  visible,
  rows: [
    { rank: 1, you: false, name: null, image: null, points: 40 },
    { rank: 2, you: true, name: 'Illia O.', image: null, points: 12 },
    { rank: 3, you: false, name: 'Ann L.', image: null, points: 3 },
  ],
  zone: 1,
  last,
  rates: [{ exercise: 'squat', per: 'rep', points: 1 }],
  bonus: { perDay: 0.05, days: 11 },
});
/** The server's answers: this board, and the visibility saved or refused. */
function server(visible: boolean | null, saves = true, last: Board['last'] = null) {
  fake.fetch.mockImplementation(async (_url: string, init?: { method?: string }) =>
    init?.method === 'PUT'
      ? saves
        ? { data: null, error: null }
        : { data: null, error: { status: 500 } }
      : { data: board(visible, last), error: null },
  );
}

/** The tab, which tells when it opens and closes; `open()` and `close()` do. */
const listeners = { focus: () => {}, blur: () => {} };
const tab = () => ({
  tab: (event: 'focus' | 'blur', listener: () => void) => {
    listeners[event] = listener;
    return () => {};
  },
});
const open = () => listeners.focus();
const close = () => listeners.blur();
const reads = () => fake.fetch.mock.calls.filter(([, init]) => !init?.method).length;

describe('the league tab', () => {
  beforeEach(async () => {
    await migrateDatabase();
    fake.fetch.mockReset();
    fake.reachable.mockReturnValue(true);
  });
  afterEach(() => vi.useRealTimers());

  it('keeps your choice; when saving fails, the switch shows what the server has', async () => {
    server(null);
    const actor = createActor(leaderboard, { input: tab() }).start();
    await waitFor(actor, (s) => s.matches('shown'));
    actor.send({ type: 'show', visible: false });
    expect(actor.getSnapshot().context.pending).toBe(false);
    await waitFor(actor, (s) => s.matches('shown'));
    expect(fake.fetch.mock.calls.at(-1)?.[1]).toMatchObject({
      method: 'PUT',
      body: { visible: false },
    });

    server(false, false);
    actor.send({ type: 'show', visible: true });
    await waitFor(actor, (s) => s.matches('shown') && s.context.saveFailed !== null);
    expect(actor.getSnapshot().context).toMatchObject({
      board: { visible: false },
      saveFailed: 'failed',
    });

    // The answer was lost, but the server took it: your name shows, so the switch says so.
    server(true, false);
    actor.send({ type: 'show', visible: true });
    await waitFor(actor, (s) => s.matches('loading'));
    await waitFor(actor, (s) => s.matches('shown'));
    expect(actor.getSnapshot().context.board?.visible).toBe(true);
  });

  it("when neither the save nor the read after it gets through, the switch shows the server's last answer", async () => {
    server(true);
    const actor = createActor(leaderboard, { input: tab() }).start();
    await waitFor(actor, (s) => s.matches('shown'));
    fake.fetch.mockRejectedValue(new TypeError('Network request failed'));
    actor.send({ type: 'show', visible: false });
    await waitFor(actor, (s) => s.matches('shown') && s.context.saveFailed !== null);
    // Your name still shows on the server: the switch mustn't say hidden.
    expect(actor.getSnapshot().context).toMatchObject({
      board: { visible: true },
      pending: null,
      problem: 'failed',
    });
  });

  it('reads the board again when the app comes back to the front only while the tab is open', async () => {
    server(true);
    const actor = createActor(leaderboard, { input: tab() }).start();
    await waitFor(actor, (s) => s.matches('shown'));
    app.change('active');
    expect(reads()).toBe(1);

    open();
    await waitFor(actor, (s) => s.matches('shown'));
    app.change('active');
    await waitFor(actor, (s) => s.matches('shown'));
    expect(reads()).toBe(3);

    close();
    app.change('active');
    expect(reads()).toBe(3);
  });

  it('says why the board is missing: no internet, or the new week starting', async () => {
    fake.reachable.mockReturnValue(false);
    fake.fetch.mockResolvedValue({ data: null, error: { status: 0 } });
    const offline = createActor(leaderboard, { input: tab() }).start();
    await waitFor(offline, (s) => s.matches('shown'));
    expect(offline.getSnapshot().context).toMatchObject({ board: null, problem: 'offline' });

    fake.reachable.mockReturnValue(true);
    fake.fetch.mockResolvedValue({ data: null, error: { status: 503 } });
    const closing = createActor(leaderboard, { input: tab() }).start();
    await waitFor(closing, (s) => s.matches('shown'));
    expect(closing.getSnapshot().context).toMatchObject({ board: null, problem: 'closing' });

    server(true);
    closing.send({ type: 'retry' });
    await waitFor(closing, (s) => s.matches('shown') && s.context.board !== null);
    expect(closing.getSnapshot().context.board?.rows[1]).toMatchObject({ you: true, rank: 2 });
    expect(closing.getSnapshot().context.problem).toBeNull();
  });

  it('a pull while the tab is reading joins that read: the spinner shows until it ends', async () => {
    server(true);
    const actor = createActor(leaderboard, { input: tab() }).start();
    await waitFor(actor, (s) => s.matches('shown'));
    open();
    expect(actor.getSnapshot().matches('loading')).toBe(true);
    actor.send({ type: 'retry' });
    expect(actor.getSnapshot().context.pulled).toBe(true);
    await waitFor(actor, (s) => s.matches('shown'));
    expect(actor.getSnapshot().context.pulled).toBe(false);
    expect(reads()).toBe(2);
  });

  it.each(['later', 'hidden', 'visible'] as const)(
    'keeps the visibility prompt through a refresh and accepts %s while it runs',
    async (answer) => {
      server(null);
      const actor = createActor(leaderboard, { input: tab() }).start();
      await waitFor(actor, (s) => s.matches('shown'));
      expect(asksVisibility(actor.getSnapshot())).toBe(true);
      let finishRead = () => {};
      fake.fetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRead = () => resolve({ data: board(null), error: null });
          }),
      );
      open();
      expect(actor.getSnapshot().matches('loading')).toBe(true);
      expect(asksVisibility(actor.getSnapshot())).toBe(true);
      actor.send(
        answer === 'later' ? { type: 'later' } : { type: 'show', visible: answer === 'visible' },
      );
      expect(asksVisibility(actor.getSnapshot())).toBe(false);
      finishRead();
      await waitFor(actor, (s) => s.matches('shown'));
      expect(asksVisibility(actor.getSnapshot())).toBe(false);
      if (answer === 'later') {
        expect(actor.getSnapshot().context.later).toBe(true);
      } else {
        expect(actor.getSnapshot().context.board?.visible).toBe(answer === 'visible');
        expect(fake.fetch).toHaveBeenCalledWith(
          expect.stringMatching(/\/leaderboard\/visibility$/),
          expect.objectContaining({
            method: 'PUT',
            body: { visible: answer === 'visible' },
          }),
        );
      }
      actor.stop();
    },
  );

  it('reads the board again each time the tab opens, keeping the last one on screen meanwhile', async () => {
    server(false);
    const actor = createActor(leaderboard, { input: tab() }).start();
    await waitFor(actor, (s) => s.matches('shown'));
    server(true);
    open();
    expect(actor.getSnapshot().context.board?.visible).toBe(false);
    await waitFor(actor, (s) => s.matches('shown') && s.context.board?.visible === true);
  });

  it("a board that couldn't be read again after the week rolled over shows as out of date, its week ended", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-11-15T22:00:00Z'));
    server(true);
    const actor = createActor(leaderboard, { input: tab() }).start();
    await waitFor(actor, (s) => s.matches('shown'));
    const { board, readAt } = actor.getSnapshot().context;
    expect(board && endsIn(board.endsAt, readAt)).toBe('ENDS IN 2 HOURS');

    // Monday: the phone comes back to the front, offline, the tab open.
    open();
    await waitFor(actor, (s) => s.matches('shown'));
    vi.setSystemTime(Date.parse('2026-11-16T07:00:00Z'));
    fake.reachable.mockReturnValue(false);
    fake.fetch.mockRejectedValue(new TypeError('Network request failed'));
    app.change('active');
    await waitFor(actor, (s) => s.matches('shown') && s.context.problem !== null);
    const stale = actor.getSnapshot().context;
    expect(stale.problem).toBe('offline');
    expect(stale.board?.week).toBe('2026-11-09');
    expect(stale.board && endsIn(stale.board.endsAt, stale.readAt)).toBe('THIS WEEK HAS ENDED');
  });

  it("takes an answer it can't read (a server older than the app) as a failed read", async () => {
    const { zone: _zone, rates: _rates, bonus: _bonus, ...older } = board(true);
    fake.fetch.mockResolvedValue({ data: older, error: null });
    const actor = createActor(leaderboard, { input: tab() }).start();
    await waitFor(actor, (s) => s.matches('shown'));
    expect(actor.getSnapshot().context).toMatchObject({ board: null, problem: 'failed' });
  });

  it('shows how last week closed until you have seen it on this phone, a restart too', async () => {
    const closed = { week: '2026-11-02', league: 'silver' as const, rank: 2, points: 140 };
    server(true, true, closed);
    const first = createActor(leaderboard, { input: tab() }).start();
    /** What the tab shows first: last week's close, or null for the board. */
    const shows = ({ context: { board, seen } }: ReturnType<typeof first.getSnapshot>) =>
      board && unseenClose(board, seen);
    await waitFor(first, (s) => s.matches('shown'));
    expect(shows(first.getSnapshot())).toEqual(closed);
    first.send({ type: 'seen' });
    expect(shows(first.getSnapshot())).toBeNull();
    first.stop();

    const again = createActor(leaderboard, { input: tab() }).start();
    await waitFor(again, (s) => s.matches('shown'));
    expect(shows(again.getSnapshot())).toBeNull();
    // A week later, a new close to see.
    server(true, true, { ...closed, week: '2026-11-09' });
    open();
    await waitFor(again, (s) => s.matches('shown') && s.context.board?.last?.week === '2026-11-09');
    expect(shows(again.getSnapshot())).toMatchObject({ week: '2026-11-09' });
  });
});

describe('what the league tab says', () => {
  /** A board of `points` by rank, you at `you` (1-based). */
  const ranked = (league: Board['league'], points: number[], you: number, zone = 3): Board => {
    return {
      ...board(true),
      league,
      zone,
      // The places that can move up, held by someone with points.
      up: league === 'gold' ? 0 : points.slice(0, zone).filter((p) => p > 0).length,
      down: league === 'bronze' ? 0 : zone,
      rows: points.map((p, i) => ({
        rank: i + 1,
        you: i + 1 === you,
        name: null,
        image: null,
        points: p,
      })),
    };
  };
  const nine = [90, 80, 70, 60, 50, 40, 30, 20, 10];

  it('says the one gap worth acting on, in points', () => {
    // 1st to 3rd move up: 4th, the first who stays, is who could push you out.
    expect(standing(ranked('silver', nine, 2))).toBe(
      "You'd move up to Gold. 4th is 20 points behind you.",
    );
    expect(standing(ranked('silver', [90, 80, 70, 70, 50, 40, 30, 20, 10], 3))).toBe(
      "You'd move up to Gold. 4th is level with you.",
    );
    // 3rd is the last place up: 71 beats its 70.
    expect(standing(ranked('silver', nine, 5))).toBe('21 points from moving up to Gold.');
    // 7th to 9th drop: 8th's 20 has to pass 6th's 40.
    expect(standing(ranked('silver', nine, 8))).toBe(
      "You'd drop to Bronze. 21 points gets you clear.",
    );
    // Bronze has no drop zone: the bottom only looks up.
    expect(standing(ranked('bronze', nine, 9))).toBe('61 points from moving up to Silver.');
    expect(standing(ranked('gold', nine, 1))).toBe(
      'You lead Gold, the top league. 2nd is 10 points behind you.',
    );
    expect(standing(ranked('gold', [90, 90, 70, 60, 50, 40, 30, 20, 10], 1))).toBe(
      'You lead Gold, the top league. 2nd is level with you.',
    );
    expect(standing(ranked('gold', nine, 4))).toBe(
      'Safe in Gold. The drop line is 30 points below you.',
    );
  });

  it('says one point is enough while a place that moves up has none', () => {
    // Two places can move up and only one is held: any point takes the other.
    expect(standing(ranked('bronze', [50, 20, 0, 0, 0, 0], 5, 2))).toBe(
      '21 points from moving up to Silver.',
    );
    expect(standing(ranked('bronze', [50, 0, 0, 0, 0, 0], 4, 2))).toBe(
      '1 point from moving up to Silver.',
    );
    expect(standing(ranked('bronze', [50, 40], 2, 0))).toBe(
      'Moving up starts once your board has three people.',
    );
  });

  it('before anyone scores, says how points come, or that a new week started', () => {
    const quiet = ranked('bronze', [0, 0, 0], 1, 1);
    expect(standing(quiet)).toBe('Every rep and second the camera counts scores points.');
    expect(
      standing({
        ...quiet,
        last: { week: '2026-11-02', league: 'bronze', rank: 4, points: 30 },
      }),
    ).toBe('A new week. Everyone on your board starts at 0.');
    // The bottom place drops even at 0: the zone says so before the new week does.
    const lastWeek = { week: '2026-11-02', league: 'silver' as const, rank: 4, points: 30 };
    expect(standing({ ...ranked('silver', [0, 0, 0], 3, 1), last: lastWeek })).toBe(
      "You'd drop to Bronze. 1 point gets you clear.",
    );
    expect(standing({ ...ranked('silver', [0, 0, 0], 2, 1), last: lastWeek })).toBe(
      'A new week. Everyone on your board starts at 0.',
    );
  });

  it('says where last week took you, and what the new board asks', () => {
    const was = (league: Board['league']) => ({
      week: '2026-11-02',
      league,
      rank: 2,
      points: 540,
    });
    expect(lastWeekWords('gold', was('silver'))).toEqual({
      title: 'Up to Gold',
      finished: '2ND · 540 POINTS',
      text: 'A new board, everyone at 0. Gold is the top league: stay out of the bottom places to keep it.',
    });
    expect(lastWeekWords('silver', was('silver')).title).toBe('Silver again');
    expect(lastWeekWords('bronze', was('silver'))).toMatchObject({
      title: 'Back to Bronze',
      text: 'A new board, everyone at 0. Nobody drops from Bronze. The top places move up to Silver.',
    });
  });

  it('adds 5% for each day in a row after the first, up to 50%', () => {
    const rule = { perDay: 0.05, days: 11 };
    expect(bonusOf(rule, 1)).toBe(0);
    expect(bonusOf(rule, 5)).toBe(20);
    expect(bonusOf(rule, 11)).toBe(50);
    expect(bonusOf(rule, 40)).toBe(50);
  });

  it('counts down in days, then hours on the last day, then says the week ended', () => {
    // Days count from the week's start, Monday 00:00 UTC: Wednesday noon is the third.
    const end = Date.parse('2026-11-16T00:00:00Z');
    expect(weekDay(end, Date.parse('2026-11-11T12:00:00Z'))).toBe(2);
    expect(weekDay(end, Date.parse('2026-11-08T23:00:00Z'))).toBe(0);
    // Read again after the week ended, offline: still its last day.
    expect(weekDay(end, Date.parse('2026-11-16T07:00:00Z'))).toBe(6);
    const monday = Date.parse('2026-11-16T00:00:00Z');
    const hour = 60 * 60 * 1000;
    expect(endsIn(monday, monday - 6 * 24 * hour)).toBe('ENDS IN 6 DAYS');
    expect(endsIn(monday, monday - 30 * hour)).toBe('ENDS IN 2 DAYS');
    expect(endsIn(monday, monday - 24 * hour)).toBe('ENDS IN 1 DAY');
    expect(endsIn(monday, monday - 23 * hour)).toBe('ENDS IN 23 HOURS');
    expect(endsIn(monday, monday - 20 * 60 * 1000)).toBe('ENDS IN 1 HOUR');
    expect(endsIn(monday, monday)).toBe('THIS WEEK HAS ENDED');
    expect(endsIn(monday, monday + hour)).toBe('THIS WEEK HAS ENDED');
  });
});
