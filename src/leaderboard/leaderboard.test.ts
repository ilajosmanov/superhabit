import { createActor, waitFor } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { endsIn, leaderboard, stakes, type Board } from './leaderboard';
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

const board = (visible: boolean | null): Board => ({
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
});
/** The server's answers: this board, and the visibility saved or refused. */
function server(visible: boolean | null, saves = true) {
  fake.fetch.mockImplementation(async (_url: string, init?: { method?: string }) =>
    init?.method === 'PUT'
      ? saves
        ? { data: null, error: null }
        : { data: null, error: { status: 500 } }
      : { data: board(visible), error: null },
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
});

describe('what the league tab says', () => {
  const week = (league: Board['league'], up: number, down: number) => ({
    ...board(true),
    league,
    up,
    down,
  });

  it('says who moves where, one or many', () => {
    expect(stakes(week('silver', 1, 1))).toBe(
      'First place moves up to Gold. Last place drops to Bronze.',
    );
    expect(stakes(week('silver', 3, 2))).toBe(
      'The top 3 move up to Gold. The bottom 2 drop to Bronze.',
    );
    expect(stakes(week('gold', 0, 3))).toBe(
      'The bottom 3 drop to Silver. Stay near the top to keep your place in Gold.',
    );
    expect(stakes(week('bronze', 0, 0))).toBe(
      'Every counted rep and second scores. Moving up starts once three people with points share your board.',
    );
  });

  it('counts down in days, then hours on the last day, then says the week ended', () => {
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
