import { AppState } from 'react-native';
import { assign, fromCallback, fromPromise, setup } from 'xstate';

import { call, Refused, thrown, whyCallFailed, type CallFailure } from '@/account/call';
import { capitalise } from '@/lib/text';

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

/** Why the board couldn't be read: as any call, or the server between weeks. */
export type Problem = CallFailure | 'closing';

/** The server is between weeks for a moment, every Monday at midnight UTC. */
const closing = (error: unknown) => error instanceof Refused && error.status === 503;

const loading = fromPromise(async () => {
  const board = await call<Board>('/leaderboard');
  if (!board) throw new Error('/leaderboard: no answer');
  return board;
});

const choosing = fromPromise<void, boolean>(async ({ input: visible }) => {
  await call('/leaderboard/visibility', { method: 'PUT', body: { visible } });
});

/** Subscribes to the tab gaining or losing focus; answers how to unsubscribe (React Navigation's `addListener`). */
export type TabEvents = (event: 'focus' | 'blur', listener: () => void) => () => void;

// Native tabs keep every tab mounted from launch: each time this one opens, or the app comes back to the
// front while it is the tab in front, the board is read again. Each read scores a whole board on the server.
const opened = fromCallback<{ type: 'opened' }, { tab: TabEvents }>(({ sendBack, input }) => {
  let inFront = false;
  const unfocus = input.tab('focus', () => {
    inFront = true;
    sendBack({ type: 'opened' });
  });
  const unblur = input.tab('blur', () => (inFront = false));
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active' && inFront) sendBack({ type: 'opened' });
  });
  return () => {
    unfocus();
    unblur();
    foreground.remove();
  };
});

/**
 * The League tab: loads your board at launch, which puts you on one the first time, and reads it again
 * each time the tab opens, the app comes back to the front with the tab open, or you tap refresh, keeping
 * the last board on screen meanwhile. A read that fails keeps the board, marked out of date (`problem`).
 * Until you choose whether others see you, it asks; a tap outside asks again next time. The switch shows
 * your choice while it is saved (`pending`), then the board's answer: if saving fails, the board is read
 * again so it shows what the server has, or, if that fails too, the last one the server gave.
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions, guards,
// delays, tags, input.
export const leaderboard = setup<
  {
    tab: TabEvents;
    /** The server's answers; `visible` is only ever what it confirmed. */
    board: Board | null;
    /** Why the last read failed; with a board, it is the last one read and may be out of date. */
    problem: Problem | null;
    /** When the board was last read or tried: past `endsAt`, its week is over. */
    readAt: number;
    /** Asked and dismissed: not again until the tab opens next. */
    later: boolean;
    saveFailed: CallFailure | null;
    /** Your choice while it is saved: the switch shows it until the server answers. */
    pending: boolean | null;
  },
  { type: 'show'; visible: boolean } | { type: 'later' } | { type: 'retry' } | { type: 'opened' },
  {
    loading: typeof loading;
    choosing: typeof choosing;
    whyCallFailed: typeof whyCallFailed;
    opened: typeof opened;
  },
  {},
  {},
  {},
  never,
  string,
  { tab: TabEvents }
>({ actors: { loading, choosing, whyCallFailed, opened } }).createMachine({
  context: ({ input }) => ({
    tab: input.tab,
    board: null,
    problem: null,
    readAt: 0,
    later: false,
    saveFailed: null,
    pending: null,
  }),
  invoke: { src: 'opened', input: ({ context }) => ({ tab: context.tab }) },
  // Dismissed, the question comes back the next time the tab opens.
  on: { opened: { actions: assign({ later: false }) } },
  initial: 'loading',
  states: {
    // The board, if any, stays while it is read again.
    loading: {
      invoke: {
        src: 'loading',
        onDone: {
          target: 'shown',
          actions: assign({
            board: ({ event }) => event.output,
            problem: null,
            readAt: () => Date.now(),
          }),
        },
        onError: [
          {
            guard: ({ event }) => closing(event.error),
            target: 'shown',
            actions: assign({ problem: 'closing', readAt: () => Date.now() }),
          },
          { target: 'failing', actions: ({ event }) => console.warn('[leaderboard]', event.error) },
        ],
      },
    },
    failing: {
      invoke: {
        src: 'whyCallFailed',
        input: thrown,
        onDone: {
          target: 'shown',
          actions: assign({ problem: ({ event }) => event.output, readAt: () => Date.now() }),
        },
        onError: {
          target: 'shown',
          actions: assign({ problem: 'failed', readAt: () => Date.now() }),
        },
      },
    },
    // With a board, or with the problem that kept it away.
    shown: {
      on: {
        show: {
          guard: ({ context }) => context.board !== null,
          target: 'choosing',
          actions: assign({ pending: ({ event }) => event.visible, saveFailed: null }),
        },
        later: { actions: assign({ later: true }) },
        retry: 'loading',
        opened: { target: 'loading', actions: assign({ later: false }) },
      },
    },
    choosing: {
      invoke: {
        src: 'choosing',
        input: ({ context }) => context.pending === true,
        onDone: {
          target: 'shown',
          actions: assign({
            board: ({ context }) => context.board && { ...context.board, visible: context.pending },
            pending: null,
          }),
        },
        onError: {
          target: 'unsaved',
          actions: [
            assign({ pending: null }),
            ({ event }) => console.warn('[leaderboard]', event.error),
          ],
        },
      },
    },
    // Says why, then reads the board again: a lost answer may hide a save that worked, so the switch
    // shows what the server has.
    unsaved: {
      invoke: {
        src: 'whyCallFailed',
        input: thrown,
        onDone: { target: 'loading', actions: assign({ saveFailed: ({ event }) => event.output }) },
        onError: { target: 'loading', actions: assign({ saveFailed: 'failed' }) },
      },
    },
  },
});

const ABOVE: Record<League, League | null> = { bronze: 'silver', silver: 'gold', gold: null };
const BELOW: Record<League, League | null> = { bronze: null, silver: 'bronze', gold: 'silver' };

/** What this week is for: who moves where when it closes. */
export function stakes({ league, up, down }: Board) {
  const above = ABOVE[league];
  const below = BELOW[league];
  if (up === 0 && down === 0) {
    return above
      ? 'Every counted rep and second scores. Moving up starts once three people with points share your board.'
      : 'Every counted rep and second scores. Stay near the top to keep your place in Gold.';
  }
  return [
    up > 0 &&
      above &&
      (up === 1
        ? `First place moves up to ${capitalise(above)}.`
        : `The top ${up} move up to ${capitalise(above)}.`),
    down > 0 &&
      below &&
      (down === 1
        ? `Last place drops to ${capitalise(below)}.`
        : `The bottom ${down} drop to ${capitalise(below)}.`),
    !above && 'Stay near the top to keep your place in Gold.',
  ]
    .filter(Boolean)
    .join(' ');
}

const HOUR = 60 * 60 * 1000;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 'S'}`;

/**
 * How long the week has left at `now`, in days, or hours on its last day (it ends at a fixed moment, not
 * your midnight); once that moment has passed, that it has ended.
 */
export function endsIn(endsAt: number, now: number) {
  if (endsAt <= now) return 'THIS WEEK HAS ENDED';
  const hours = Math.ceil((endsAt - now) / HOUR);
  return hours < 24
    ? `ENDS IN ${plural(hours, 'HOUR')}`
    : `ENDS IN ${plural(Math.ceil(hours / 24), 'DAY')}`;
}
