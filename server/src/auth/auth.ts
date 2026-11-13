import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';

import type { Db } from '../db/db';
import * as schema from '../db/schema';
import type { Bindings } from '../env';

const DAY = 24 * 60 * 60;

/**
 * Better Auth for one request. The phone signs in with the ID token Google's own sign-in gives it, checked
 * against our Web client ID; the session goes back as a cookie that `@better-auth/expo` keeps in secure storage.
 */
export const createAuth = (env: Bindings, db: Db) => {
  // Better Auth would fall back to its public default key; it only refuses that when NODE_ENV is production.
  if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not set');
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        // The web page's redirect flow (`/delete`): always ask which account, so "Not me" can pick another.
        // The phone's ID tokens don't use it.
        prompt: 'select_account',
      },
    },
    // A year, renewed once a day while the app is used: a phone offline for weeks stays signed in.
    session: { expiresIn: 365 * DAY, updateAge: DAY },
    trustedOrigins: ['reprepgo://'],
    plugins: [expo()],
    // The default, said out loud: Better Auth turns origin checks off under test runners, and ours run them.
    advanced: { disableOriginCheck: false },
  });
};
