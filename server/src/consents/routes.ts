import { Hono } from 'hono';

import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
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
  /** Gives or withdraws a consent: `{ kind: 'traces' | 'video', policyVersion, granted }`. */
  .put('/consent', signedIn, async (c) => {
    const change = consentChange(await c.req.json().catch(() => null));
    if (!change) return c.json({ error: 'expected { kind, policyVersion, granted }' }, 400);
    await setConsent(c.var.db, c.var.userId, change);
    return c.body(null, 204);
  });
