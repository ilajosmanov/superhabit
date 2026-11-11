import { addNetworkStateListener } from 'expo-network';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { AppState } from 'react-native';
import { assign, fromCallback, fromPromise, setup } from 'xstate';

import { SessionGone } from '@/account/server';
import { shareTraces } from '@/account/share-traces';
import { send, sync } from '@/account/sync';

const FIRST_RETRY_MS = 5_000;
const LAST_RETRY_MS = 5 * 60_000;

/** Something may need sending; `pull` when what the server holds may have changed too. */
type Kick = { type: 'kick'; pull: boolean };

// When to look again: the app comes back to the front, the network comes back, or a change is queued.
const listen = fromCallback(({ sendBack }) => {
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active') sendBack({ type: 'kick', pull: true });
  });
  const network = addNetworkStateListener(({ isInternetReachable }) => {
    if (isInternetReachable) sendBack({ type: 'kick', pull: true });
  });
  // Our own sends change the outbox too: the send that follows finds nothing and stops.
  const queued = addDatabaseChangeListener(({ tableName }) => {
    if (tableName === 'outbox') sendBack({ type: 'kick', pull: false });
  });
  return () => {
    foreground.remove();
    network.remove();
    queued.remove();
  };
});

// Then the traces whose workouts the server now has.
const round = fromPromise<void, boolean>(async ({ input: pull }) => {
  await (pull ? sync() : send());
  await shareTraces();
});

/**
 * Keeps your account on the server up to date while you're signed in: sends and pulls at the start, when
 * the app comes back to the front and when the network does; sends a second after a change is queued (Done,
 * a join, a freeze). Each round then shares the traces waiting to go. A failure tries again later, slower each time, up to 5 minutes apart, or at once on the
 * next kick; a session the server ended stops it until the next sign-in starts it again.
 *
 *   running --done--> idle --kick--> soon --1 s--> running
 *      |  \--done or failed, kicked meanwhile--> soon
 *      \--failed--> backingOff --5 s, 10 s … 5 min--> running   (a kick: --> soon)
 *       \--session gone--> over
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions, guards,
// delays.
export const keepSynced = setup<
  {
    /** The next round pulls too. */
    pull: boolean;
    /** This round pulls. */
    pulling: boolean;
    /** A kick came while this round ran: another follows. */
    again: boolean;
    /** The last wait before trying again; 0 after a success. */
    wait: number;
  },
  Kick,
  { listen: typeof listen; round: typeof round },
  {},
  { want: undefined; failed: undefined },
  {},
  'retry'
>({
  actors: { listen, round },
  actions: {
    want: assign({ pull: ({ context, event }) => context.pull || event.pull }),
    // The round's pull isn't lost, and the next wait is longer.
    failed: assign(({ context }) => ({
      pull: context.pull || context.pulling,
      wait: Math.min(Math.max(context.wait * 2, FIRST_RETRY_MS), LAST_RETRY_MS),
    })),
  },
  delays: { retry: ({ context }) => context.wait },
}).createMachine({
  context: { pull: true, pulling: false, again: false, wait: 0 },
  invoke: { src: 'listen' },
  initial: 'running',
  states: {
    idle: { on: { kick: { target: 'soon', actions: 'want' } } },
    // A burst of kicks makes one round.
    soon: {
      after: { 1_000: 'running' },
      on: { kick: { target: 'soon', reenter: true, actions: 'want' } },
    },
    running: {
      entry: assign(({ context }) => ({ pulling: context.pull, pull: false, again: false })),
      invoke: {
        src: 'round',
        input: ({ context }) => context.pulling,
        onDone: [
          { guard: ({ context }) => context.again, target: 'soon', actions: assign({ wait: 0 }) },
          { target: 'idle', actions: assign({ wait: 0 }) },
        ],
        onError: [
          { guard: ({ event }) => event.error instanceof SessionGone, target: 'over' },
          {
            // You did something meanwhile: try again in a second, not after the backoff.
            guard: ({ context }) => context.again,
            target: 'soon',
            actions: ['failed', ({ event }) => console.warn('[sync] round failed', event.error)],
          },
          {
            target: 'backingOff',
            actions: [
              'failed',
              ({ context, event }) =>
                console.warn('[sync] trying again in', context.wait, 'ms', event.error),
            ],
          },
        ],
      },
      on: { kick: { actions: [assign({ again: true }), 'want'] } },
    },
    backingOff: {
      after: { retry: 'running' },
      // You did something, or the network came back: no need to wait out the backoff.
      on: { kick: { target: 'soon', actions: 'want' } },
    },
    over: { type: 'final' },
  },
});
