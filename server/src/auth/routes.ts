import { Hono } from 'hono';

import { open } from '../db/db';
import type { Route } from '../env';
import { createAuth } from './auth';
import { signInLimit } from './sign-in-limit';

// Only what the app and the /delete page use. Better Auth serves many more (update-user would let a member
// set the name and photo URL board mates' phones load; delete-user would skip our deletion), and new
// versions add more, so the rest are never routed rather than listed as disabled.
const USED = ['/sign-in/social', '/callback/:id', '/get-session', '/sign-out', '/error'].map(
  (path) => `/api/auth${path}`,
);

/** Better Auth's own routes: sign-in, the session, sign-out. */
export const authRoutes = new Hono<Route>()
  // Only POSTs: the session check at launch must not be refused when many phones share an IP.
  .on('POST', '/api/auth/*', signInLimit)
  .on(['GET', 'POST'], USED, (c) => createAuth(c.env, open(c.env)).handler(c.req.raw));
