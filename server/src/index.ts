import { Hono } from 'hono';

import { accountRoutes, deletePageRoutes } from './account/routes';
import { purgeDeleted } from './account/store';
import { authRoutes } from './auth/routes';
import { consentRoutes } from './consents/routes';
import { open } from './db/db';
import type { Bindings, Route } from './env';
import { syncRoutes } from './sync/routes';
import { traceRoutes } from './traces/routes';
import { sweepTraces } from './traces/store';

const app = new Hono<Route>()
  // Up, and the database answers.
  .get('/health', async (c) => {
    await c.env.DB.prepare('select 1').first();
    return c.json({ ok: true });
  })
  .route('/', authRoutes)
  .route('/', accountRoutes)
  .route('/', deletePageRoutes)
  .route('/', consentRoutes)
  .route('/', syncRoutes)
  .route('/', traceRoutes);

/**
 * The Worker: HTTP through the app, and the daily Cron (wrangler.jsonc): traces no longer shared, and
 * what deleted accounts left.
 */
export default {
  fetch: app.fetch,
  scheduled: async (_controller, env) => {
    const db = open(env);
    // Each runs though the other fails (an R2 outage mustn't hold up the purge); the Cron still fails.
    const runs = await Promise.allSettled([sweepTraces(db, env.TRACES), purgeDeleted(db)]);
    for (const run of runs) if (run.status === 'rejected') throw run.reason;
  },
} satisfies ExportedHandler<Bindings>;
