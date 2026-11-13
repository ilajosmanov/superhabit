import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/client';
import * as SecureStore from 'expo-secure-store';

import { SERVER_URL } from './server';

/** How long a call waits for the server. */
export const TIMEOUT_MS = 20_000;

/** Better Auth's client: it keeps the session cookie in secure storage and sends it with each call. */
export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  // React Native's HTTP client never times out: a stalled network would keep "Signing in…" up for good.
  // A call given its own `signal` loses this (Better Fetch's rule): it adds `AbortSignal.timeout` itself.
  fetchOptions: { timeout: TIMEOUT_MS },
  plugins: [
    expoClient({
      scheme: 'reprepgo',
      storagePrefix: 'reprepgo',
      storage: SecureStore,
      // The session's data lives in the database (storage/account.ts); only the cookie goes to the store.
      disableCache: true,
    }),
  ],
});
