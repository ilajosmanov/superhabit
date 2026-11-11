import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
import { readHeader } from './header';
import { keepTrace, mayKeep } from './store';

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
    async (c) => {
      const setId = c.req.param('setId');
      if (!SET_ID.test(setId)) return c.json({ error: 'not a set id' }, 400);
      const { db, userId } = c.var;
      const { consentId, synced } = await mayKeep(db, userId, setId);
      if (!consentId) return c.json({ error: 'sharing is off' }, 403);
      if (!synced) return c.json({ error: "its workout hasn't synced" }, 409);
      const file = await c.req.arrayBuffer();
      const header = await readHeader(file);
      if (
        header?.setId !== setId ||
        !header.consent.some((consent) => consent.startsWith('traces@'))
      ) {
        return c.json({ error: 'not a whole trace of this set, recorded while sharing' }, 422);
      }
      if (!(await keepTrace(db, c.env.TRACES, { userId, setId, consentId }, file))) {
        return c.json({ error: 'sharing is off' }, 403);
      }
      return c.body(null, 204);
    },
  );
