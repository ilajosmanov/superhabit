import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { accountLimit } from '../auth/account-limit';
import { signedIn } from '../auth/signed-in';
import type { SignedInRoute } from '../env';
import { change } from './changes';
import { applyChanges, changesAfter } from './store';

const MAX_CHANGES = 50;

export const syncRoutes = new Hono<SignedInRoute>()
  /**
   * A phone's outbox rows, oldest first: `{ changes: [{ entity, entityId, op, payload }] }`. Answers one
   * result per change, `{ ok: true }` or `{ ok: false, reason }`; a refused change doesn't stop the rest.
   */
  .post(
    '/sync',
    bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: 'over 1 MB' }, 413) }),
    signedIn,
    accountLimit,
    async (c) => {
      const body = z
        .object({ changes: z.array(z.unknown()).max(MAX_CHANGES) })
        .safeParse(await c.req.json().catch(() => null));
      if (!body.success) {
        return c.json({ error: `expected { changes: [...] }, at most ${MAX_CHANGES}` }, 400);
      }
      const checked = body.data.changes.map((raw) => change.safeParse(raw));
      await applyChanges(
        c.var.db,
        c.var.userId,
        checked.flatMap((result) => (result.success ? [result.data] : [])),
      );
      return c.json({
        results: checked.map((result) =>
          result.success ? { ok: true } : { ok: false, reason: z.prettifyError(result.error) },
        ),
      });
    },
  )
  /**
   * The account's rows written after the cursor `after` (0 for all), oldest first, in pages:
   * `{ rows: [{ entity, row }], cursor, more }`. The phone sends its own changes first.
   */
  .get('/sync', signedIn, async (c) => {
    const after = z.coerce
      .number()
      .pipe(z.int().nonnegative())
      .safeParse(c.req.query('after') ?? 0);
    if (!after.success) return c.json({ error: 'after: a cursor from the last page' }, 400);
    return c.json(await changesAfter(c.var.db, c.var.userId, after.data));
  });
