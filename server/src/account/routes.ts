import { Hono } from 'hono';

import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
import { deleteAccount, me } from './store';

export const accountRoutes = new Hono<SignedInRoute>()
  /** Who you are, as Google gave it, and the consents in force. */
  .get('/me', signedIn, async (c) => c.json(await me(c.var.db, c.var.userId)))
  .delete('/account', signedIn, async (c) => {
    await deleteAccount(c.var.db, c.var.userId);
    return c.body(null, 204);
  });
