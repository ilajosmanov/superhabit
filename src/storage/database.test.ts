import { describe, expect, it } from 'vite-plus/test';

import { db, migrateDatabase } from './__fixtures__/database';
import * as schema from './schema';

describe('migrations', () => {
  it('create every table on an empty database, and a second run changes nothing', async () => {
    await migrateDatabase();
    // Selecting every column of every table fails if the migrations and the schema disagree.
    for (const table of Object.values(schema)) expect(db().select().from(table).all()).toEqual([]);
    db().insert(schema.settings).values({ key: 'sound', value: true }).run();

    await migrateDatabase();

    expect(await db().query.settings.findMany()).toEqual([{ key: 'sound', value: true }]);
  });
});
