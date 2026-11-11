import { Hono } from 'hono';
import { z } from 'zod';

import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
import { changeConsent } from './store';

const consentChange = z.object({
  kind: z.enum(['traces', 'video']),
  policyVersion: z.string().regex(/^[\w.-]{1,40}$/),
  granted: z.boolean(),
});

export const consentRoutes = new Hono<SignedInRoute>()
  /**
   * Gives or withdraws a consent: `{ kind: 'traces' | 'video', policyVersion, granted }`. Withdrawing
   * traces deletes those shared.
   */
  .put('/consent', signedIn, async (c) => {
    const body = consentChange.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'expected { kind, policyVersion, granted }' }, 400);
    await changeConsent(c.var.db, c.env.TRACES, c.var.userId, body.data);
    return c.body(null, 204);
  });
