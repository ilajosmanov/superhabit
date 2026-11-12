import type { Db } from './db/db';

/** What the Worker is given: `wrangler.jsonc`'s bindings and vars, and the secrets set with `wrangler secret put`. */
export type Bindings = Env & {
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_SECRET: string;
  SENTRY_DSN?: string;
};

/** A route's Hono environment. */
export type Route = { Bindings: Bindings };

/** Behind `signedIn`: the database and the signed-in user's id. */
export type SignedInRoute = Route & { Variables: { db: Db; userId: string } };
