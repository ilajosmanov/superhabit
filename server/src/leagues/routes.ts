import { Hono } from 'hono';
import { z } from 'zod';

import { accountLimit } from '../auth/account-limit';
import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
import { board, chooseVisibility } from './store';

export const leagueRoutes = new Hono<SignedInRoute>()
  /**
   * Your board this week: `{ week, endsAt, league, up, down, visible, rows: [{ rank, you, name, image,
   * points }] }`, where `up` and `down` count the places that move. 503 for the moment last week closes.
   */
  .get('/leaderboard', signedIn, accountLimit, async (c) => {
    const yours = await board(c.var.db, c.var.userId, Date.now());
    if (!yours) return c.json({ error: 'last week is closing' }, 503);
    return c.json(yours);
  })
  /** Whether others see your name and photo: `{ visible }`. */
  .put('/leaderboard/visibility', signedIn, async (c) => {
    const body = z.object({ visible: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'expected { visible }' }, 400);
    await chooseVisibility(c.var.db, c.var.userId, body.data.visible);
    return c.body(null, 204);
  });
