import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import { fromPromise } from 'xstate';

import { authClient } from './auth-client';
import { clearSignedOut, keepAccount, markSignedOut } from './store';
import { unsent } from './sync';
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
 * Ends the session with the server and Google, if they can be reached (20 s at most). Waited for: a late
 * answer would clear the cookie of a sign-in tapped right after.
 */
export async function endSession() {
  const results = await Promise.allSettled([authClient.signOut(), GoogleOneTapSignIn.signOut()]);
  for (const result of results) {
    if (result.status === 'rejected') console.warn('[account] sign-out failed', result.reason);
  }
}

/**
 * You signed out on Profile, which sent what was waiting: the database is cleared (`clearSignedOut`). Only
 * if something is still unsent (the server had ended the session) is it kept, marked signed out, for the
 * same account to send at its next sign-in. The sign-in screen then ends the session (`signIn` with
 * `leaving`).
 */
// shortcut: signed out offline (nothing was waiting), the server's session lives on until it expires.
export const signOut = fromPromise(async () => (unsent() > 0 ? markSignedOut() : clearSignedOut()));
