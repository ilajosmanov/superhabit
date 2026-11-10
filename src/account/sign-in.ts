import { getNetworkStateAsync } from 'expo-network';
import {
  GoogleOneTapSignIn,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';
import { assign, fromPromise, setup } from 'xstate';

import { authClient } from './auth-client';
import { GOOGLE_WEB_CLIENT_ID } from './server';
import { keepAccount } from './store';

/** Why the last try didn't sign in; null when nothing went wrong (or you closed Google's sheet). */
export type SignInError = 'offline' | 'failed' | null;

/**
 * Google's own sheet picks the account (a saved one first, then any on the phone); the server checks its ID
 * token and starts a session; the account is kept on the phone. `cancelled` when you closed the sheet.
 */
async function signInWithGoogle(): Promise<'signedIn' | 'cancelled'> {
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
  keepAccount({ id, name, image: image ?? null });
  return 'signedIn';
}

const signingIn = fromPromise(() => signInWithGoogle());
const reachable = fromPromise(async () => (await getNetworkStateAsync()).isInternetReachable);

/** The sign-in screen's button: one try at a time; done once the account is kept. */
// Positional generics (no type assertions allowed): context, events, actors.
export const signIn = setup<
  { error: SignInError },
  { type: 'press' },
  { signingIn: typeof signingIn; reachable: typeof reachable }
>({ actors: { signingIn, reachable } }).createMachine({
  context: { error: null },
  initial: 'idle',
  states: {
    idle: { on: { press: { target: 'signingIn', actions: assign({ error: null }) } } },
    signingIn: {
      invoke: {
        src: 'signingIn',
        onDone: [
          { guard: ({ event }) => event.output === 'cancelled', target: 'idle' },
          { target: 'done' },
        ],
        onError: {
          target: 'failing',
          actions: ({ event }) => console.warn('[sign-in]', event.error),
        },
      },
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
