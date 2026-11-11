import { assign, fromPromise, setup, type SnapshotFrom } from 'xstate';

import { call, thrown, whyCallFailed, type CallFailure } from './call';
import { setSharing, shares } from './consent';
import { SessionGone } from './server';
import { refused, send, unsentWorkouts } from './sync';
import type { Sharing } from '@/storage/consent';

const sharing = fromPromise<void, boolean>(({ input }) => setSharing(input));

/**
 * How long the switch keeps the call's place after it went through: the shared snapshot's live query reads
 * the kept answer again within a frame or two of the write, after the call has already returned.
 */
const SETTLE_MS = 300;
const deleting = fromPromise(async () => {
  await call('/account', { method: 'DELETE' });
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

/**
 * Profile's account controls, one call at a time (the switch is off while one runs). Turning sharing on
 * first shows what's shared (`confirming`: agree or cancel). The switch shows its new place at once while
 * the call runs and for a moment after it went through (`settling`, while the shared snapshot catches up),
 * then what the phone keeps: on goes back if the server didn't take it (turning it off never fails:
 * `setSharing`). Sign out and Delete
 * account each ask first (`asking`), and say there why a try failed; the dialog's action works only while
 * nothing runs. Delete account: once the server has deleted it, `deleted` (provided by the screen) hands
 * over to startup, which clears the phone. Sign out first sends what's waiting, so the database can be
 * cleared: offline it waits for the internet, and changes the server refused are named and the next tap
 * signs out anyway; then `signedOut` hands over. A call the server answers with "signed out" ends in
 * `ended`: the screen says so and offers signing in again.
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions.
export const me = setup<
  {
    /** The switch's new place while its call runs, and while the snapshot catches up (`settling`). */
    sharing: boolean;
    /** Why the last call failed: under the switch, or in the open dialog. */
    error: CallFailure | null;
    /** Changes the server refused: the next Sign out loses them. */
    refused: number;
    /** Workouts a failed sign-out couldn't send. */
    unsent: number;
  },
  | { type: 'share'; on: boolean }
  | { type: 'agree' }
  | { type: 'cancel' }
  | { type: 'askDelete' }
  | { type: 'delete' }
  | { type: 'askSignOut' }
  | { type: 'signOut' },
  {
    sharing: typeof sharing;
    deleting: typeof deleting;
    signingOut: typeof signingOut;
    whyCallFailed: typeof whyCallFailed;
  },
  {},
  { deleted: undefined; signedOut: undefined; forget: undefined }
>({
  actors: { sharing, deleting, signingOut, whyCallFailed },
  actions: {
    deleted: () => {},
    signedOut: () => {},
    // A dialog opens on a clean slate: what an earlier try said is not this one's answer.
    forget: assign({ error: null, refused: 0, unsent: 0 }),
  },
}).createMachine({
  id: 'me',
  context: { sharing: false, error: null, refused: 0, unsent: 0 },
  initial: 'idle',
  states: {
    idle: {
      on: {
        share: [
          // Turning it on first shows what's shared, as the first question did.
          {
            guard: ({ event }) => event.on,
            target: 'confirming',
            actions: assign({ error: null }),
          },
          { target: 'sharing', actions: assign({ sharing: false, error: null }) },
        ],
        askDelete: 'deleting',
        askSignOut: 'signingOut',
      },
    },
    confirming: {
      on: {
        agree: { target: 'sharing', actions: assign({ sharing: true }) },
        cancel: 'idle',
      },
    },
    sharing: {
      invoke: {
        src: 'sharing',
        input: ({ context }) => context.sharing,
        onDone: 'settling',
        onError: {
          target: 'sharingFailed',
          actions: ({ event }) => console.warn('[consent]', event.error),
        },
      },
    },
    // The call's answer is kept; the shared snapshot's live query reads it a moment later.
    settling: { after: { [SETTLE_MS]: 'idle' } },
    // Says why: the session is gone, no internet, or anything else.
    sharingFailed: {
      invoke: {
        src: 'whyCallFailed',
        input: thrown,
        onDone: [
          { guard: ({ event }) => event.output === 'signedOut', target: 'ended' },
          { target: 'idle', actions: assign({ error: ({ event }) => event.output }) },
        ],
        onError: { target: 'idle', actions: assign({ error: 'failed' }) },
      },
    },
    signingOut: {
      entry: 'forget',
      exit: 'forget',
      initial: 'asking',
      states: {
        asking: { on: { signOut: 'sending', cancel: '#me.idle' } },
        sending: {
          invoke: {
            src: 'signingOut',
            input: ({ context }) => context.refused > 0,
            onDone: [
              {
                guard: ({ event }) => event.output === 0,
                target: '#me.left',
                actions: 'signedOut',
              },
              { target: 'asking', actions: assign({ refused: ({ event }) => event.output }) },
            ],
            onError: {
              target: 'failing',
              actions: [
                assign({ unsent: () => unsentWorkouts() }),
                ({ event }) => console.warn('[account] sign-out failed', event.error),
              ],
            },
          },
        },
        failing: {
          invoke: {
            src: 'whyCallFailed',
            input: thrown,
            onDone: { target: 'asking', actions: assign({ error: ({ event }) => event.output }) },
            onError: { target: 'asking', actions: assign({ error: 'failed' }) },
          },
        },
      },
    },
    deleting: {
      entry: 'forget',
      exit: 'forget',
      initial: 'asking',
      states: {
        asking: { on: { delete: 'sending', cancel: '#me.idle' } },
        sending: {
          invoke: {
            src: 'deleting',
            onDone: { target: '#me.deleted', actions: 'deleted' },
            onError: {
              target: 'failing',
              actions: ({ event }) => console.warn('[account] delete failed', event.error),
            },
          },
        },
        // A retry of a delete whose answer was lost finds the session gone with the account: `ended`.
        failing: {
          invoke: {
            src: 'whyCallFailed',
            input: thrown,
            onDone: [
              { guard: ({ event }) => event.output === 'signedOut', target: '#me.ended' },
              { target: 'asking', actions: assign({ error: ({ event }) => event.output }) },
            ],
            onError: { target: 'asking', actions: assign({ error: 'failed' }) },
          },
        },
      },
    },
    // The server ended the session: the account is marked signed out (`call`); the screen offers sign-in.
    ended: {},
    deleted: { type: 'final' },
    left: { type: 'final' },
  },
});

/**
 * Where Profile's switch stands: its new place while the call runs and settles, so it doesn't jump back
 * before the shared snapshot has read the answer kept; else the answer this phone keeps (`kept`, the
 * snapshot's), which a change behind the screen updates too (`heardOff`).
 */
export const sharingShown = (state: SnapshotFrom<typeof me>, kept: Sharing | null) =>
  state.matches('sharing') || state.matches('settling') ? state.context.sharing : shares(kept);

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the Sign out dialog says when the server refused changes: signing out loses them. */
export const refusedText = (refused: number) =>
  `${count(refused, 'change')} couldn't be saved to your account. Signing out loses ${refused === 1 ? 'it' : 'them'}.`;

/** Why signing out waits: why it failed, and what hasn't reached your account yet. */
export function notSent(why: string, workouts: number) {
  const what =
    workouts > 0
      ? `Your last ${count(workouts, 'workout')} ${workouts === 1 ? "isn't" : "aren't"}`
      : "Your latest changes aren't";
  return `${why}\n\n${what} saved to your account yet. Sign out once ${workouts === 1 ? 'it is' : 'they are'}.`;
}
