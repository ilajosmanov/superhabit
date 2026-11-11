import { createActor, waitFor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { leaderboard, type Board } from './leaderboard';

// Our server and the network are faked; the machine is real.
const fake = vi.hoisted(() => ({ fetch: vi.fn(), reachable: vi.fn(() => true) }));
vi.mock('@/account/auth-client', () => ({ authClient: { $fetch: fake.fetch } }));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isInternetReachable: fake.reachable() }),
}));
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));

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

/** The tab, which tells when it opens; `open()` opens it. */
let open = () => {};
const tab = () => ({
  onFocus: (listener: () => void) => {
    open = listener;
    return () => {};
  },
});

describe('the league tab', () => {
  beforeEach(() => {
    fake.fetch.mockReset();
    fake.reachable.mockReturnValue(true);
  });

  it('keeps your choice; when saving fails, the switch shows what the server has', async () => {
    server(null);
    const actor = createActor(leaderboard, { input: tab() }).start();
    await waitFor(actor, (s) => s.matches('shown'));
    actor.send({ type: 'show', visible: false });
    expect(actor.getSnapshot().context.board?.visible).toBe(false);
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

  it('says why the board is missing: no internet, or the new week starting', async () => {
    fake.reachable.mockReturnValue(false);
    fake.fetch.mockResolvedValue({ data: null, error: { status: 0 } });
    const offline = createActor(leaderboard, { input: tab() }).start();
    await waitFor(offline, (s) => s.matches('failed'));
    expect(offline.getSnapshot().context.problem).toBe('offline');

    fake.reachable.mockReturnValue(true);
    fake.fetch.mockResolvedValue({ data: null, error: { status: 503 } });
    const closing = createActor(leaderboard, { input: tab() }).start();
    await waitFor(closing, (s) => s.matches('failed'));
    expect(closing.getSnapshot().context.problem).toBe('closing');

    server(true);
    closing.send({ type: 'retry' });
    await waitFor(closing, (s) => s.matches('shown'));
    expect(closing.getSnapshot().context.board?.rows[1]).toMatchObject({ you: true, rank: 2 });
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
});
