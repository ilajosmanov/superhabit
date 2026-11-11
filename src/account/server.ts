/**
 * The Worker the app talks to (server/ in this repo): production, unless `EXPO_PUBLIC_SERVER_URL` was set
 * when Metro started or the release was built (Expo inlines it then; unset, it inlines `undefined`).
 */
export const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://superhabit.cloudflare-putt001.workers.dev';

/** Our Web client in Google Cloud: Google's sign-in gives the phone an ID token for it, and the server checks that. */
export const GOOGLE_WEB_CLIENT_ID =
  '408762936395-b66qcgf9a751gcv04p1jiorrier10amd.apps.googleusercontent.com';

/** The server answered that the session is gone: nothing goes up or down until you sign in again. */
export class SessionGone extends Error {}
