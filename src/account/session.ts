import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import { fromPromise } from 'xstate';

import { authClient } from './auth-client';
import { keepAccount, markSignedOut } from './store';
import { account } from '@/storage/account';

/**
 * At launch, once the app is up: asks the server for the session, which renews it (once a day) and brings
 * your name and photo up to date. `gone` only when the server answers that it no longer exists (signed out,
 * expired, the account deleted): the next launch asks you to sign in. Offline or any failure is `unknown`
 * and changes nothing.
 */
export const checkSession = fromPromise(async (): Promise<'ok' | 'gone' | 'unknown'> => {
  // Better Auth's client throws when the request never reached the server.
  const answer = await authClient.getSession().catch(() => null);
  if (!answer || answer.error) return 'unknown';
  if (!answer.data) {
    markSignedOut();
    return 'gone';
  }
  const { id, name, image } = answer.data.user;
  // Only ever your own name and photo: another account here would clear the database under open screens.
  if (id !== account()?.id) return 'unknown';
  keepAccount({ id, name, image: image ?? null });
  return 'ok';
});

/**
 * You signed out on Me. The account is marked signed out at once, its data kept: the same account signing in
 * finds it again, another replaces it. The server and Google are told if they can be reached; nothing waits.
 */
// shortcut: offline, the server's session lives on until it expires; send the sign-out with sync (piece 5).
export const signOut = fromPromise(async () => {
  markSignedOut();
  const tell = (what: string) => (error: unknown) => console.warn(`[account] ${what}`, error);
  void authClient.signOut().catch(tell('server sign-out failed'));
  void GoogleOneTapSignIn.signOut().catch(tell('Google sign-out failed'));
});
