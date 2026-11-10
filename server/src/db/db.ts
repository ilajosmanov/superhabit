import { drizzle } from 'drizzle-orm/d1';

import { authRelations } from './schema';

/** The D1 database through Drizzle, for one request or Cron run (D1 is reached only inside one). */
export const open = (env: Env) => drizzle(env.DB, { relations: authRelations });
export type Db = ReturnType<typeof open>;
