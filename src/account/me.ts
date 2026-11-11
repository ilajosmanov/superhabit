import { addDatabaseChangeListener } from 'expo-sqlite';
import { assign, fromCallback, fromPromise, setup } from 'xstate';

import { authClient } from './auth-client';
import { setSharing, sharingNow, whyFailed, type ConsentError } from './consent';
import { SERVER_URL, SessionGone } from './server';
import { refused, send, unsentWorkouts } from './sync';

const sharing = fromPromise<void, boolean>(({ input }) => setSharing(input));
const deleting = fromPromise(async () => {
  const { error } = await authClient.$fetch(`${SERVER_URL}/account`, { method: 'DELETE' });
  if (error) throw new Error(error.message ?? `delete: ${error.status}`);
});

// Sign out sends what's waiting first: the database is cleared after. Its answer: how many changes the
// server refused, which signing out would lose (0 with `anyway`). A session the server already ended can't
// send: startup then keeps what's unsent for the same account's next sign-in (`signOut`).
const signingOut = fromPromise<number, boolean>(async ({ input: anyway }) => {
  await send().catch((error: unknown) => {
    if (!(error instanceof SessionGone)) throw error;
  });
  return anyway ? 0 : refused();
});

// Sharing can change behind the screen: the server said it was turned off on another phone (`heardOff`).
const settingsChanged = fromCallback(({ sendBack }) => {
  const listener = addDatabaseChangeListener(({ tableName }) => {
    if (tableName === 'settings') sendBack({ type: 'reread' });
  });
  return () => listener.remove();
});

type Failure = { about: 'sharing' | 'deleting' | 'signingOut'; why: ConsentError };

/**
 * Profile's account controls, one call at a time (the switch is off while one runs). Turning sharing on
 * first shows what's shared (`confirming`: agree or cancel). The switch shows its new place at once; on
 * goes back if the server didn't take it (turning it off never fails: `setSharing`). Delete account:
 * once the server has deleted it, `deleted` (provided by the screen) hands over to startup, which clears
 * the phone. Sign out first sends what's waiting, so the database can be cleared: offline it waits for the
 * internet, and changes the server refused are named and need `anyway`; then `signedOut` hands over.
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions.
export const me = setup<
  {
    sharing: boolean;
    error: Failure | null;
    /** Changes the server refused: Sign out anyway loses them. */
    refused: number;
    /** Workouts a failed sign-out couldn't send. */
    unsent: number;
  },
  | { type: 'share'; on: boolean }
  | { type: 'agree' }
  | { type: 'cancel' }
  | { type: 'delete' }
  | { type: 'signOut'; anyway?: boolean }
  | { type: 'reread' },
  {
    sharing: typeof sharing;
    deleting: typeof deleting;
    signingOut: typeof signingOut;
    whyFailed: typeof whyFailed;
    settingsChanged: typeof settingsChanged;
  },
  {},
  { deleted: undefined; signedOut: undefined }
>({
  actors: { sharing, deleting, signingOut, whyFailed, settingsChanged },
  actions: { deleted: () => {}, signedOut: () => {} },
}).createMachine({
  context: () => ({ sharing: sharingNow(), error: null, refused: 0, unsent: 0 }),
  invoke: { src: 'settingsChanged' },
  initial: 'idle',
  states: {
    idle: {
      // What this phone keeps, after a call, or a change heard while one ran.
      entry: assign({ sharing: () => sharingNow() }),
      on: {
        reread: { target: 'idle', reenter: true },
        share: [
          // Turning it on first shows what's shared, as the first question did.
          {
            guard: ({ event }) => event.on,
            target: 'confirming',
            actions: assign({ error: null }),
          },
          { target: 'sharing', actions: assign({ sharing: false, error: null }) },
        ],
        delete: { target: 'deleting', actions: assign({ error: null }) },
        signOut: { target: 'signingOut', actions: assign({ error: null }) },
      },
    },
    confirming: {
      on: {
        agree: { target: 'sharing', actions: assign({ sharing: true }) },
        cancel: 'idle',
      },
    },
    signingOut: {
      invoke: {
        src: 'signingOut',
        input: ({ event }) => event.type === 'signOut' && event.anyway === true,
        onDone: [
          { guard: ({ event }) => event.output === 0, target: 'left', actions: 'signedOut' },
          { target: 'idle', actions: assign({ refused: ({ event }) => event.output }) },
        ],
        onError: {
          target: 'failing',
          actions: [
            assign({
              error: { about: 'signingOut', why: 'failed' },
              unsent: () => unsentWorkouts(),
            }),
            ({ event }) => console.warn('[account] sign-out failed', event.error),
          ],
        },
      },
    },
    sharing: {
      invoke: {
        src: 'sharing',
        input: ({ context }) => context.sharing,
        onDone: 'idle',
        onError: {
          target: 'failing',
          actions: [
            assign({ sharing: false, error: { about: 'sharing', why: 'failed' } }),
            ({ event }) => console.warn('[consent]', event.error),
          ],
        },
      },
    },
    deleting: {
      invoke: {
        src: 'deleting',
        onDone: { target: 'deleted', actions: 'deleted' },
        onError: {
          target: 'failing',
          actions: [
            assign({ error: { about: 'deleting', why: 'failed' } }),
            ({ event }) => console.warn('[account] delete failed', event.error),
          ],
        },
      },
    },
    // Says why: no internet, or anything else.
    failing: {
      invoke: {
        src: 'whyFailed',
        onDone: {
          target: 'idle',
          actions: assign({
            error: ({ context, event }) =>
              context.error && { about: context.error.about, why: event.output },
          }),
        },
        onError: 'idle',
      },
    },
    deleted: { type: 'final' },
    left: { type: 'final' },
  },
});
