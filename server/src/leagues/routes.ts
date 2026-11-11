import { Hono } from 'hono';

import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
import { board, chooseVisibility } from './store';

export const leagueRoutes = new Hono<SignedInRoute>()
  /**
   * Your board this week: `{ week, endsAt, league, up, down, visible, rows: [{ rank, you, name, image,
   * points }] }`, where `up` and `down` count the places that move. 503 for the moment last week closes.
   */
  .get('/leaderboard', signedIn, async (c) => {
    const yours = await board(c.var.db, c.var.userId, Date.now());
    if (!yours) return c.json({ error: 'last week is closing' }, 503);
    return c.json(yours);
  })
  /** Whether others see your name and photo: `{ visible }`. */
  .put('/leaderboard/visibility', signedIn, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const visible =
      typeof body === 'object' && body !== null && 'visible' in body ? body.visible : null;
    if (typeof visible !== 'boolean') return c.json({ error: 'expected { visible }' }, 400);
    await chooseVisibility(c.var.db, c.var.userId, visible);
    return c.body(null, 204);
  });
