import { assign, fromCallback, fromPromise, setup } from 'xstate';

import { authClient } from '@/account/auth-client';
import { whyFailed, type ConsentError } from '@/account/consent';
import { SERVER_URL } from '@/account/server';

export type League = 'bronze' | 'silver' | 'gold';

/** Your board this week, as `GET /leaderboard` answers (`server/src/leagues/store.ts`). */
export type Board = {
  week: string;
  /** When the week closes: Monday 00:00 UTC. */
  endsAt: number;
  league: League;
  /** How many places at the top move up, and at the bottom down. */
  up: number;
  down: number;
  /** Whether you chose to be seen; null until asked. */
  visible: boolean | null;
  /** By rank; `name` and `image` are null for someone hidden. */
  rows: { rank: number; you: boolean; name: string | null; image: string | null; points: number }[];
};

/** The server is between weeks for a moment, every Monday at midnight UTC. */
class Closing extends Error {}

const loading = fromPromise(async () => {
  const { data, error } = await authClient.$fetch<Board>(`${SERVER_URL}/leaderboard`, {
    timeout: 20_000,
  });
  if (error) throw error.status === 503 ? new Closing() : new Error(`leaderboard: ${error.status}`);
  return data;
});

const choosing = fromPromise<void, boolean>(async ({ input: visible }) => {
  const { error } = await authClient.$fetch(`${SERVER_URL}/leaderboard/visibility`, {
    method: 'PUT',
    body: { visible },
    timeout: 20_000,
  });
  if (error) throw new Error(`visibility: ${error.status}`);
});

type Problem = 'offline' | 'failed' | 'closing';

/** Subscribes to the tab gaining focus; answers how to unsubscribe (React Navigation's `addListener`). */
type OnFocus = (listener: () => void) => () => void;

// Native tabs keep every tab mounted from launch: each time this one opens, the board is read again.
const opened = fromCallback<{ type: 'opened' }, { onFocus: OnFocus }>(({ sendBack, input }) =>
  input.onFocus(() => sendBack({ type: 'opened' })),
);

/**
 * The League tab: loads your board at launch, which puts you on one the first time, and reads it again
 * each time the tab opens, keeping the last board on screen meanwhile. Until you choose whether others see
 * you, it asks; a tap outside asks again next time. The switch shows its new place at once; if saving
 * fails, the board is read again so it shows what the server has.
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions, guards,
// delays, tags, input.
export const leaderboard = setup<
  {
    onFocus: OnFocus;
    board: Board | null;
    problem: Problem | null;
    /** Asked and dismissed: not again until the tab opens next. */
    later: boolean;
    saveFailed: ConsentError;
  },
  { type: 'show'; visible: boolean } | { type: 'later' } | { type: 'retry' } | { type: 'opened' },
  {
    loading: typeof loading;
    choosing: typeof choosing;
    whyFailed: typeof whyFailed;
    opened: typeof opened;
  },
  {},
  {},
  {},
  never,
  string,
  { onFocus: OnFocus }
>({ actors: { loading, choosing, whyFailed, opened } }).createMachine({
  context: ({ input }) => ({
    onFocus: input.onFocus,
    board: null,
    problem: null,
    later: false,
    saveFailed: null,
  }),
  invoke: { src: 'opened', input: ({ context }) => ({ onFocus: context.onFocus }) },
  // Dismissed, the question comes back the next time the tab opens.
  on: { opened: { actions: assign({ later: false }) } },
  initial: 'loading',
  states: {
    loading: {
      invoke: {
        src: 'loading',
        onDone: { target: 'shown', actions: assign({ board: ({ event }) => event.output }) },
        onError: [
          {
            guard: ({ event }) => event.error instanceof Closing,
            target: 'failed',
            actions: assign({ board: null, problem: 'closing' }),
          },
          {
            target: 'failing',
            actions: [
              assign({ board: null }),
              ({ event }) => console.warn('[leaderboard]', event.error),
            ],
          },
        ],
      },
    },
    shown: {
      on: {
        show: {
          target: 'choosing',
          actions: assign({
            board: ({ context, event }) =>
              context.board && { ...context.board, visible: event.visible },
            saveFailed: null,
          }),
        },
        later: { actions: assign({ later: true }) },
        opened: { target: 'refreshing', actions: assign({ later: false }) },
      },
    },
    // The board stays while it is read again; if that fails, the last one is still what you see.
    refreshing: {
      invoke: {
        src: 'loading',
        onDone: { target: 'shown', actions: assign({ board: ({ event }) => event.output }) },
        onError: {
          target: 'shown',
          actions: ({ event }) => console.warn('[leaderboard]', event.error),
        },
      },
    },
    choosing: {
      invoke: {
        src: 'choosing',
        input: ({ context }) => context.board?.visible === true,
        onDone: 'shown',
        onError: {
          target: 'unsaved',
          actions: ({ event }) => console.warn('[leaderboard]', event.error),
        },
      },
    },
    // Says why, then reads the board again: a lost answer may hide a save that worked, so the switch
    // shows what the server has.
    unsaved: {
      invoke: {
        src: 'whyFailed',
        onDone: { target: 'loading', actions: assign({ saveFailed: ({ event }) => event.output }) },
        onError: { target: 'loading', actions: assign({ saveFailed: 'failed' }) },
      },
    },
    failing: {
      invoke: {
        src: 'whyFailed',
        onDone: {
          target: 'failed',
          actions: assign({ problem: ({ event }) => event.output ?? 'failed' }),
        },
        onError: { target: 'failed', actions: assign({ problem: 'failed' }) },
      },
    },
    failed: {
      on: {
        retry: { target: 'loading', actions: assign({ problem: null }) },
        opened: { target: 'loading', actions: assign({ problem: null, later: false }) },
      },
    },
  },
});
