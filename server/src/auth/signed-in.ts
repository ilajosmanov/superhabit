import { createMiddleware } from 'hono/factory';

import { open } from '../db/db';
import type { SignedInRoute } from '../env';
import { createAuth } from './auth';

/** For routes that need a session: 401 without one; otherwise the database and the user's id. */
export const signedIn = createMiddleware<SignedInRoute>(async (c, next) => {
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
