import { Hono } from 'hono';

import { open } from '../db/db';
import type { Route } from '../env';
import { createAuth } from './auth';
import { signInLimit } from './sign-in-limit';

/** Better Auth's own routes: sign-in, the session, sign-out. */
export const authRoutes = new Hono<Route>()
  // Only POSTs: the session check at launch must not be refused when many phones share an IP.
  .on('POST', '/api/auth/*', signInLimit)
  .on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env, open(c.env)).handler(c.req.raw));
