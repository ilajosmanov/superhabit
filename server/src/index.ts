import { Hono } from 'hono';

import { accountRoutes } from './account/routes';
import { purgeDeleted } from './account/store';
import { authRoutes } from './auth/routes';
import { consentRoutes } from './consents/routes';
import { open } from './db/db';
import type { Bindings, Route } from './env';

const app = new Hono<Route>()
  // Up, and the database answers.
  .get('/health', async (c) => {
    await c.env.DB.prepare('select 1').first();
    return c.json({ ok: true });
  })
  .route('/', authRoutes)
  .route('/', accountRoutes)
  .route('/', consentRoutes);

/** The Worker: HTTP through the app, and the daily Cron (wrangler.jsonc) purging deleted accounts. */
export default {
  fetch: app.fetch,
  scheduled: async (_controller, env) => {
    await purgeDeleted(open(env));
  },
} satisfies ExportedHandler<Bindings>;
