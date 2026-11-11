import { createMiddleware } from 'hono/factory';
import { routePath } from 'hono/route';

import type { SignedInRoute } from '../env';

/**
 * Calls per account to each costly route (`POST /sync`, `PUT /traces/<set>`, `GET /leaderboard`), by
 * Cloudflare's rate limiter (`ACCOUNT_LIMIT`, wrangler.jsonc). Behind `signedIn`: it counts by the user's id.
 */
export const accountLimit = createMiddleware<SignedInRoute>(async (c, next) => {
  const key = `${c.req.method} ${routePath(c)} ${c.var.userId}`;
  const { success } = await c.env.ACCOUNT_LIMIT.limit({ key });
  if (!success) return c.json({ error: 'too many calls, wait a minute' }, 429);
  await next();
});
