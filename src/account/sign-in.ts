import { getNetworkStateAsync } from 'expo-network';
import {
  GoogleOneTapSignIn,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';
import { assign, fromPromise, setup } from 'xstate';

import { authClient } from './auth-client';
import { endSession } from './session';
import { GOOGLE_WEB_CLIENT_ID } from './server';
import { keepAccount, replacing } from './store';
import type { Account } from '@/storage/account';

/** Why the last try didn't sign in; null when nothing went wrong (or you closed Google's sheet). */
export type SignInError = 'offline' | 'failed' | null;

type Signed = { account: Account; replacing: string | null };

/**
 * Google's own sheet picks the account (a saved one first, then any on the phone); the server checks its ID
 * token and starts a session. The account it gives back, with whose data keeping it would clear; or
 * `cancelled` when you closed the sheet.
 */
async function signInWithGoogle(): Promise<Signed | 'cancelled'> {
  GoogleOneTapSignIn.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  let picked = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(picked)) picked = await GoogleOneTapSignIn.createAccount();
  if (isNoSavedCredentialFoundResponse(picked)) {
    picked = await GoogleOneTapSignIn.presentExplicitSignIn();
  }
  if (!isSuccessResponse(picked)) return 'cancelled';
  const { data, error } = await authClient.signIn.social({
    provider: 'google',
    idToken: { token: picked.data.idToken },
  });
  if (error || !data || !('user' in data)) throw new Error(error?.message ?? 'no session');
  const { id, name, image } = data.user;
  const account = { id, name, image: image ?? null };
  return { account, replacing: replacing(account) };
}

const signingIn = fromPromise(() => signInWithGoogle());
const keeping = fromPromise<void, Account | null>(async ({ input }) => {
  if (!input) throw new Error('Nothing to keep');
  keepAccount(input);
});
const reachable = fromPromise(async () => (await getNetworkStateAsync()).isInternetReachable);
const forgetting = fromPromise(() => endSession());

type Context = {
  error: SignInError;
  /** Signed in with Google and the server, not kept yet. */
  next: Account | null;
  /** Whose data keeping `next` would clear; asked about first. */
  replacing: string | null;
  /** Here from Profile's Sign out: the old session ends first. */
  leaving: boolean;
  /** The button was tapped while the old session was ending: signing in follows. */
  pressed: boolean;
};

/**
 * The sign-in screen's button: one try at a time; done once the account is kept. Signing in as another
 * account while this phone holds someone's data asks first: it'd be cleared, and nothing else has it until
 * sync. After Profile's Sign out (`leaving`) the old session ends before signing in starts, so its late
 * answer can't clear a new sign-in's cookie; the button looks ready meanwhile, and a tap waits for it.
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions, guards,
// delays, tags, input.
export const signIn = setup<
  Context,
  { type: 'press' } | { type: 'replace' } | { type: 'keepTheirs' },
  {
    signingIn: typeof signingIn;
    keeping: typeof keeping;
    reachable: typeof reachable;
    forgetting: typeof forgetting;
  },
  {},
  {},
  {},
  never,
  string,
  { leaving?: boolean } | undefined
>({ actors: { signingIn, keeping, reachable, forgetting } }).createMachine({
  context: ({ input }) => ({
    error: null,
    next: null,
    replacing: null,
    leaving: input?.leaving ?? false,
    pressed: false,
  }),
  initial: 'starting',
  states: {
    starting: {
      always: [{ guard: ({ context }) => context.leaving, target: 'forgetting' }, 'idle'],
    },
    idle: { on: { press: { target: 'signingIn', actions: assign({ error: null }) } } },
    signingIn: {
      invoke: {
        src: 'signingIn',
        onDone: [
          { guard: ({ event }) => event.output === 'cancelled', target: 'idle' },
          {
            target: 'asking',
            guard: ({ event }) => event.output !== 'cancelled' && event.output.replacing !== null,
            actions: assign(({ event }) =>
              event.output === 'cancelled'
                ? {}
                : { next: event.output.account, replacing: event.output.replacing },
            ),
          },
          {
            target: 'keeping',
            actions: assign({
              next: ({ event }) => (event.output === 'cancelled' ? null : event.output.account),
            }),
          },
        ],
        onError: {
          target: 'failing',
          actions: ({ event }) => console.warn('[sign-in]', event.error),
        },
      },
    },
    asking: { on: { replace: 'keeping', keepTheirs: 'forgetting' } },
    keeping: {
      invoke: {
        src: 'keeping',
        input: ({ context }) => context.next,
        onDone: 'done',
        onError: { target: 'idle', actions: assign({ error: 'failed' }) },
      },
    },
    // Keep them, or here from Sign out: the session ends before a sign-in starts.
    forgetting: {
      on: { press: { actions: assign({ pressed: true, error: null }) } },
      invoke: {
        src: 'forgetting',
        onDone: [{ guard: ({ context }) => context.pressed, target: 'signingIn' }, 'idle'],
        onError: [{ guard: ({ context }) => context.pressed, target: 'signingIn' }, 'idle'],
      },
      exit: assign({ next: null, replacing: null, leaving: false, pressed: false }),
    },
    // Says why: no internet, or anything else.
    failing: {
      invoke: {
        src: 'reachable',
        onDone: {
          target: 'idle',
          actions: assign({
            error: ({ event }) => (event.output === false ? 'offline' : 'failed'),
          }),
        },
        onError: { target: 'idle', actions: assign({ error: 'failed' }) },
      },
    },
    done: { type: 'final' },
  },
});
