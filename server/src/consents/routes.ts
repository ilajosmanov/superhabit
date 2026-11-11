import { Hono } from 'hono';

import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
import { dropTraces, sharesTraces } from '../traces/store';
import { setConsent, type ConsentKind } from './store';

/** `{ kind, policyVersion, granted }` from a request body, or null when it isn't one. */
function consentChange(
  body: unknown,
): { kind: ConsentKind; policyVersion: string; granted: boolean } | null {
  if (typeof body !== 'object' || body === null) return null;
  if (!('kind' in body && 'policyVersion' in body && 'granted' in body)) return null;
  const { policyVersion, granted } = body;
  const kind = body.kind === 'traces' || body.kind === 'video' ? body.kind : null;
  if (!kind) return null;
  if (typeof policyVersion !== 'string' || !/^[\w.-]{1,40}$/.test(policyVersion)) return null;
  if (typeof granted !== 'boolean') return null;
  return { kind, policyVersion, granted };
}

export const consentRoutes = new Hono<SignedInRoute>()
  /**
   * Gives or withdraws a consent: `{ kind: 'traces' | 'video', policyVersion, granted }`. Withdrawing
   * traces deletes those shared.
   */
  .put('/consent', signedIn, async (c) => {
    const change = consentChange(await c.req.json().catch(() => null));
    if (!change) return c.json({ error: 'expected { kind, policyVersion, granted }' }, 400);
    const { db, userId } = c.var;
    // Sharing again after a withdrawal whose deletion failed: those traces go before the new grant.
    if (change.kind === 'traces' && change.granted && !(await sharesTraces(db, userId))) {
      await dropTraces(db, c.env.TRACES, userId);
    }
    await setConsent(db, userId, change);
    // What was shared goes with the consent; the daily sweep catches a deletion that fails here.
    if (change.kind === 'traces' && !change.granted) await dropTraces(db, c.env.TRACES, userId);
    return c.body(null, 204);
  });
