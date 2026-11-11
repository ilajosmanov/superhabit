import { AppState } from 'react-native';
import { assign, fromCallback, fromPromise, setup } from 'xstate';
import { z } from 'zod';

import { call, Refused, thrown, whyCallFailed, type CallFailure } from '@/account/call';
import { resultSeen, seeResult } from './store';
import { capitalise } from '@/lib/text';

const league = z.enum(['bronze', 'silver', 'gold']);
export type League = z.infer<typeof league>;

/**
 * Your board this week, as `GET /leaderboard` answers (`server/src/leagues/store.ts`). Checked on arrival:
 * an answer of another shape (a server older than this app) is a failed read, never a crash.
 */
const boardSchema = z.object({
  week: z.string(),
  /** When the week closes: Monday 00:00 UTC. */
  endsAt: z.number(),
  league,
  /** How many places at the top move up, and at the bottom down. */
  up: z.number(),
  down: z.number(),
  /** Whether you chose to be seen; null until asked. */
  visible: z.boolean().nullable(),
  /** By rank; `name` and `image` are null for someone hidden. */
  rows: z.array(
    z.object({
      rank: z.number(),
      you: z.boolean(),
      name: z.string().nullable(),
      image: z.string().nullable(),
      points: z.number(),
    }),
  ),
  /** How many places at each end can move (`min(5, n/3)`); `up` and `down` are those that do now. */
  zone: z.number(),
  /** How last week closed for you; null if you weren't on a board. */
  last: z.object({ week: z.string(), league, rank: z.number(), points: z.number() }).nullable(),
  /** What one rep, or ten seconds of a hold, scores before the streak bonus. */
  rates: z.array(
    z.object({ exercise: z.string(), per: z.enum(['rep', '10 s']), points: z.number() }),
  ),
  /** The streak bonus: `perDay` for each day in a row after the first, counting up to `days` days. */
  bonus: z.object({ perDay: z.number(), days: z.number() }),
});
export type Board = z.infer<typeof boardSchema>;

/** Why the board couldn't be read: as any call, or the server between weeks. */
export type Problem = CallFailure | 'closing';

/** The server is between weeks for a moment, every Monday at midnight UTC. */
const closing = (error: unknown) => error instanceof Refused && error.status === 503;

const loading = fromPromise(async () => {
  return boardSchema.parse(await call('/leaderboard'));
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
 * each time the tab opens, the app comes back to the front with the tab open, or you pull down to refresh, keeping
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
    /** The last week whose close you've seen: until `board.last` is it, the tab shows how it closed. */
    seen: string | null;
    /** You pulled to read again: the spinner shows until the read ends. */
    pulled: boolean;
  },
  | { type: 'show'; visible: boolean }
  | { type: 'later' }
  | { type: 'retry' }
  | { type: 'opened' }
  | { type: 'seen' },
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
    seen: resultSeen(),
    pulled: false,
  }),
  invoke: { src: 'opened', input: ({ context }) => ({ tab: context.tab }) },
  // Dismissed, the question comes back the next time the tab opens.
  on: {
    opened: { actions: assign({ later: false }) },
    seen: {
      actions: [
        assign({ seen: ({ context }) => context.board?.last?.week ?? context.seen }),
        ({ context }) => {
          if (!context.seen) return;
          // Not kept, it shows once more next launch: no worse than that.
          try {
            seeResult(context.seen);
          } catch (error) {
            console.warn('[leaderboard] seen', error);
          }
        },
      ],
    },
  },
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
      entry: assign({ pulled: false }),
      on: {
        show: {
          guard: ({ context }) => context.board !== null,
          target: 'choosing',
          actions: assign({ pending: ({ event }) => event.visible, saveFailed: null }),
        },
        later: { actions: assign({ later: true }) },
        retry: { target: 'loading', actions: assign({ pulled: true }) },
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

/** Lowest first. */
export const LEAGUES: League[] = ['bronze', 'silver', 'gold'];
const ABOVE: Record<League, League | null> = { bronze: 'silver', silver: 'gold', gold: null };
const BELOW: Record<League, League | null> = { bronze: null, silver: 'bronze', gold: 'silver' };

const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;
const ordinal = (n: number) =>
  n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));

const behind = (place: number, gap: number) =>
  gap > 0
    ? `${ordinal(place)} is ${points(gap)} behind you.`
    : `${ordinal(place)} is level with you.`;

/** Whether anyone on the board has points: until then ranks mean nothing (a tie is ordered by id). */
export const scored = ({ rows }: Board) => rows.some((row) => row.points > 0);

/**
 * The one thing worth acting on, in points: how far you are from the line above you, or from safety in the
 * drop zone; while you would move up, how far ahead of the first place that stays you are.
 */
export function standing(board: Board) {
  const { rows, league, up, down, zone, last } = board;
  const above = ABOVE[league];
  const below = BELOW[league];
  const you = rows.find((row) => row.you);
  if (!you || !scored(board)) {
    return last
      ? 'A new week. Everyone on your board starts at 0.'
      : 'Every rep and second the camera counts scores points.';
  }
  const { rank, points: mine } = you;
  const n = rows.length;
  if (above && rank <= up) {
    // The first place that stays is who could push you out.
    return `You'd move up to ${capitalise(above)}. ${behind(up + 1, mine - rows[up].points)}`;
  }
  if (below && rank > n - down) {
    return `You'd drop to ${capitalise(below)}. ${points(rows[n - down - 1].points - mine + 1)} gets you clear.`;
  }
  if (above) {
    if (zone === 0) return 'Moving up starts once your board has three people.';
    // The last place that can move up; with no points there, any point takes it.
    const line = rank <= zone ? 0 : rows[zone - 1].points;
    return `${points(Math.max(1, line - mine + 1))} from moving up to ${capitalise(above)}.`;
  }
  if (rank === 1) {
    const second = rows[1];
    return `You lead Gold, the top league.${second ? ` ${behind(2, mine - second.points)}` : ''}`;
  }
  const lead = down > 0 ? mine - rows[n - down].points : 0;
  return lead > 0 ? `Safe in Gold. The drop line is ${points(lead)} below you.` : 'Safe in Gold.';
}

/** The bonus your next set earns, in whole percent, when it makes `days` days in a row. */
export const bonusOf = ({ perDay, days: cap }: Board['bonus'], days: number) =>
  Math.round(perDay * (Math.max(1, Math.min(days, cap)) - 1) * 100);

const DAY = 24 * 60 * 60 * 1000;
/**
 * Which of the league week's seven days `now` falls on (0 = the first). Its days run from its end (Monday
 * 00:00 UTC) back, so west of UTC each starts the evening before your own.
 */
export const weekDay = (endsAt: number, now: number) =>
  Math.min(6, Math.max(0, Math.floor((now - (endsAt - 7 * DAY)) / DAY)));

/** How last week closed, in words: where you are now, and what the new board asks. */
export function lastWeekWords({ league, last }: Board) {
  if (!last) return null;
  const now = capitalise(league);
  const was = LEAGUES.indexOf(last.league);
  const is = LEAGUES.indexOf(league);
  const above = ABOVE[league];
  const below = BELOW[league];
  const title = is > was ? `Up to ${now}` : is < was ? `Back to ${now}` : `${now} again`;
  const asks = !above
    ? 'Gold is the top league: stay out of the bottom places to keep it.'
    : !below
      ? `Nobody drops from Bronze. The top places move up to ${capitalise(above)}.`
      : `The top places move up to ${capitalise(above)}; the bottom ones drop to ${capitalise(below)}.`;
  return {
    title,
    finished: `${ordinal(last.rank)} · ${points(last.points)}`.toUpperCase(),
    text: `A new board, everyone at 0. ${asks}`,
  };
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

/** The first letter of each of the league week's days, by the weekday most of it falls on where you are. */
export const weekLetters = (endsAt: number) =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(endsAt - (7 - i) * DAY + DAY / 2).toLocaleDateString([], { weekday: 'narrow' }),
  );

/** When the week closes, where you are: "Sunday 19:00" west of UTC, "Monday 02:00" in Kyiv. */
export const closesAt = (endsAt: number) =>
  new Date(endsAt).toLocaleString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' });
