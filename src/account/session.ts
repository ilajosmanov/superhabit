import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import { fromPromise } from 'xstate';

import { authClient, TIMEOUT_MS } from './auth-client';
import { oneAtATime } from './one-at-a-time';
import { clearSignedOut, keepAccount, markSignedOut, sessionNow } from './store';
import { unsent } from './sync';
import { account } from '@/storage/account';

/**
 * The calls whose answer writes the session cookie (Better Auth's Expo plugin does, before the call
 * returns), one at a time: a sign-in's cookie goes in only after a session check's answer is done writing.
 */
export const cookieTurn = oneAtATime();

/**
 * At launch, once the app is up: asks the server for the session, which renews it (once a day) and brings
 * your name and photo up to date. `gone` only when the server answers that it no longer exists (signed out,
 * expired, the account deleted): the next launch asks you to sign in. Offline or any failure is `unknown`
 * and changes nothing. Stopped (startup left `ready`), its request is aborted: an answer not yet in never
 * reaches the cookie, and one already being read writes it before a sign-in's call starts (`cookieTurn`).
 */
export const checkSession = fromPromise(async ({ signal }): Promise<'ok' | 'gone' | 'unknown'> => {
  const owner = account()?.id;
  const session = sessionNow();
  const fetchOptions = { signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) };
  // Better Auth's client throws when the request never reached the server, or was aborted.
  const answer = await cookieTurn(() => authClient.getSession({ fetchOptions })).catch(() => null);
  // Stopped after its answer was in, or a sign-in came since: the session is no longer this one.
  if (!answer || answer.error || !owner || signal.aborted || sessionNow() !== session) {
    return 'unknown';
  }
  if (!answer.data) {
    markSignedOut();
    return 'gone';
  }
  const { id, name, image } = answer.data.user;
  // Only ever your own name and photo: another account here would clear the database under open screens.
  if (id !== owner) return 'unknown';
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
 * same account to send at its next sign-in (`byYou`: that sign-in screen doesn't say the session ended).
 * The sign-in screen then ends the session (`signIn` with `leaving`).
 */
// Signed out offline, the server's session stays until it expires (a year), but nothing holds it: Better
// Auth's Expo plugin clears the phone's cookie before the sign-out call goes.
export const signOut = fromPromise(async () =>
  unsent() > 0 ? markSignedOut(true) : clearSignedOut(),
);
