import { getNetworkStateAsync } from 'expo-network';
import { fromPromise } from 'xstate';

import { authClient } from './auth-client';
import { SERVER_URL, SessionGone } from './server';
import { markSignedOut, sessionNow } from './store';

/** The server answered with an error status other than 401. */
export class Refused extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * A call to our server, with the session cookie and the client's 20 s timeout: its answer's body, null when
 * it has none. A 401 marks the account signed out, as the session check at launch does (the next launch
 * asks you to sign in), and throws `SessionGone`; any other error status throws `Refused`. Throws the
 * client's own error when the server can't be reached.
 */
export async function call<T>(
  path: string,
  init?: { method?: 'POST' | 'PUT' | 'DELETE'; body?: object; timeout?: number },
): Promise<T | null> {
  const session = sessionNow();
  const { data, error } = await authClient.$fetch<T>(`${SERVER_URL}${path}`, init);
  if (error?.status === 401) throw sessionEnded(session);
  if (error) throw new Refused(error.status, error.message ?? `${path}: ${error.status}`);
  return data;
}

/**
 * The server answered 401 to a call made in `session` (`sessionNow`, read before it): the kept account is
 * marked signed out, so the next launch asks you to sign in. The error to throw.
 */
export function sessionEnded(session: string) {
  // Signed in again meanwhile, as this account or another: the new session is fine.
  if (session === sessionNow()) markSignedOut();
  return new SessionGone();
}

/** Why a call to our server failed. */
export type CallFailure = 'offline' | 'failed' | 'signedOut';

/** Why the call that threw `input` failed: the session is gone, no internet, or anything else. */
export const whyCallFailed = fromPromise<CallFailure, unknown>(async ({ input: error }) => {
  if (error instanceof SessionGone) return 'signedOut';
  return (await getNetworkStateAsync()).isInternetReachable === false ? 'offline' : 'failed';
});

/** The error a failed actor's event carries: `whyCallFailed`'s input in a machine. */
export const thrown = ({ event }: { event: { type: string } }) =>
  'error' in event ? event.error : null;

/** What a screen says when a call failed. */
export const FAILURE_TEXT: Record<CallFailure, string> = {
  offline: 'No internet. Connect and try again.',
  failed: "Couldn't reach Superhabit. Try again.",
  signedOut: "You've been signed out. Sign in again; what isn't sent yet stays on this phone.",
};
