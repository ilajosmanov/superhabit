import { Hono } from 'hono';

import { accountRoutes, deletePageRoutes } from './account/routes';
import { purgeDeleted } from './account/store';
import { authRoutes } from './auth/routes';
import { consentRoutes } from './consents/routes';
import { open } from './db/db';
import type { Bindings, Route } from './env';
import { leagueRoutes } from './leagues/routes';
import { closeWeek, placeTrainers, weekOf } from './leagues/store';
import { addDays } from './leagues/points';
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
  .route('/', traceRoutes)
  .route('/', leagueRoutes);

/**
 * The Worker: HTTP through the app, and the hourly Cron (wrangler.jsonc). Each hour, the leagues: last week
 * closed if it isn't yet (Monday's first run; a failed close is finished an hour later), then whoever
 * trained this week put on a board. At midnight UTC also traces no longer shared and what deleted accounts
 * left.
 */
export default {
  fetch: app.fetch,
  scheduled: async (controller, env) => {
    const db = open(env);
    // The time it was due, not when it ran: a run a moment early still belongs to its hour.
    const due = controller.scheduledTime;
    const week = weekOf(due);
    const leagues = async () => {
      await closeWeek(db, addDays(week, -7));
      await placeTrainers(db, week);
    };
    const daily =
      new Date(due).getUTCHours() === 0 ? [sweepTraces(db, env.TRACES), purgeDeleted(db)] : [];
    // Each runs though another fails (an R2 outage mustn't hold up the purge); the Cron still fails.
    const runs = await Promise.allSettled([leagues(), ...daily]);
    for (const run of runs) if (run.status === 'rejected') throw run.reason;
  },
} satisfies ExportedHandler<Bindings>;
