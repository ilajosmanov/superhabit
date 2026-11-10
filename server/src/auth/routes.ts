import { Hono } from 'hono';

import { open } from '../db/db';
import type { Route } from '../env';
import { createAuth } from './auth';

/** Better Auth's own routes: sign-in, the session, sign-out. */
export const authRoutes = new Hono<Route>()
  // Sign-in attempts per caller, by Cloudflare's rate limiter: Better Auth's own counts live in one isolate's
  // memory. Only POSTs: the session check at launch must not be refused when many phones share an IP.
  .on('POST', '/api/auth/*', async (c, next) => {
    const { success } = await c.env.AUTH_LIMIT.limit({
      key: c.req.header('cf-connecting-ip') ?? '',
    });
    if (!success) return c.json({ error: 'too many tries, wait a minute' }, 429);
    await next();
  })
  .on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env, open(c.env)).handler(c.req.raw));
