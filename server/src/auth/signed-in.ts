import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import { open } from '../db/db';
import type { Route, SignedInRoute } from '../env';
import { createAuth } from './auth';

/** A browser names the page a request comes from; the app names none. True for another site's page. */
export const fromAnotherSite = <E extends Route>(c: Context<E>) => {
  const origin = c.req.header('origin');
  return origin !== undefined && origin !== new URL(c.env.BETTER_AUTH_URL).origin;
};

/**
 * For routes that need a session: 401 without one; otherwise the database and the user's id. A change
 * another site's page asks for is refused (403), whatever cookie the browser sends with it.
 */
export const signedIn = createMiddleware<SignedInRoute>(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && fromAnotherSite(c)) {
    return c.json({ error: 'not from this site' }, 403);
  }
  const db = open(c.env);
  // No renewal here: only `/api/auth/get-session`, which the app calls at launch, renews, so the renewed
  // cookie reaches the phone.
  const session = await createAuth(c.env, db).api.getSession({
    headers: c.req.raw.headers,
    query: { disableRefresh: true },
  });
  if (!session) return c.json({ error: 'signed out' }, 401);
  c.set('db', db);
  c.set('userId', session.user.id);
  await next();
});
