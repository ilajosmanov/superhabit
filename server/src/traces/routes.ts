import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { accountLimit } from '../auth/account-limit';
import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
import { offerTrace } from './store';

const MAX_BYTES = 8 * 1024 * 1024;
const SET_ID = /^[\w-]{1,64}$/;

export const traceRoutes = new Hono<SignedInRoute>()
  /**
   * A set's trace file, as recorded (`.sht`). Taken only while the account shares, for a set it has synced,
   * from a file recorded while sharing was on. 204 when kept; 403 sharing is off; 409 its workout hasn't
   * synced yet; 413 over 8 MB; 422 not a whole trace of this set recorded while sharing.
   */
  .put(
    '/traces/:setId',
    bodyLimit({ maxSize: MAX_BYTES, onError: (c) => c.json({ error: 'over 8 MB' }, 413) }),
    signedIn,
    accountLimit,
    async (c) => {
      const setId = c.req.param('setId');
      if (!SET_ID.test(setId)) return c.json({ error: 'not a set id' }, 400);
      const outcome = await offerTrace(
        c.var.db,
        c.env.TRACES,
        { userId: c.var.userId, setId },
        () => c.req.arrayBuffer(),
      );
      switch (outcome) {
        case 'kept':
          return c.body(null, 204);
        case 'sharingOff':
          return c.json({ error: 'sharing is off' }, 403);
        case 'notSynced':
          return c.json({ error: "its workout hasn't synced" }, 409);
        case 'notATrace':
          return c.json({ error: 'not a whole trace of this set, recorded while sharing' }, 422);
      }
    },
  );
