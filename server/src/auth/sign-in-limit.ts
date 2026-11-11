import { createMiddleware } from 'hono/factory';

import type { Route } from '../env';

/**
 * Sign-in attempts per caller, by Cloudflare's rate limiter: Better Auth's own counts live in one isolate's
 * memory.
 */
export const signInLimit = createMiddleware<Route>(async (c, next) => {
  const { success } = await c.env.AUTH_LIMIT.limit({ key: c.req.header('cf-connecting-ip') ?? '' });
  if (!success) return c.json({ error: 'too many tries, wait a minute' }, 429);
  await next();
});
