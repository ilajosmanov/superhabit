import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { db, migrateDatabase } from './__fixtures__/database';
import * as schema from './schema';

const workout = (id: string, status: 'open' | 'done') =>
  db()
    .insert(schema.workouts)
    .values({
      id,
      day: '2026-11-09',
      status,
      startedAt: 0,
      tzOffsetMin: 120,
      tz: 'Europe/Tallinn',
      appVersion: '1.0.0',
    })
    .run();

const set = (id: string, planStep: number) =>
  db()
    .insert(schema.sets)
    .values({
      id,
      workoutId: 'w',
      planStep,
      exercise: 'pushup',
      goal: { reps: 10 },
      reps: 10,
      noReps: 0,
      heldMs: 0,
      startedAt: 0,
      endedAt: 1,
      counterVersion: '1.0.0',
      attempts: [],
    })
    .run();

// Drizzle wraps SQLite's error; another constraint failing must not pass for these.
const failed = (constraint: string) =>
  expect.objectContaining({
    cause: expect.objectContaining({
      message: expect.stringContaining(`${constraint} constraint failed`),
    }),
  });
const unique = failed('UNIQUE');

describe('migrations', () => {
  it('create every table on an empty database, and a second run changes nothing', async () => {
    await migrateDatabase();
    // Selecting every column of every table fails if the migrations and the schema disagree.
    for (const table of Object.values(schema)) expect(db().select().from(table).all()).toEqual([]);
    db().insert(schema.settings).values({ key: 'sound', value: true }).run();

    await migrateDatabase();

    expect(await db().query.settings.findMany()).toEqual([{ key: 'sound', value: true }]);
  });

  it('allow only one open workout at a time', async () => {
    await migrateDatabase();
    workout('a', 'done');
    workout('b', 'done');
    workout('c', 'open');
    expect(() => workout('d', 'open')).toThrow(unique);
  });

  it('keep one set per planned step of a workout', async () => {
    await migrateDatabase();
    workout('w', 'done');
    set('s1', 0);
    set('s2', 1);
    expect(() => set('s3', 1)).toThrow(unique);
  });

  it('reject a row without its key', async () => {
    await migrateDatabase();
    // Raw SQL: Drizzle's types never let a key be left out.
    expect(() => db().run(sql`insert into settings (value) values ('1')`)).toThrow(
      failed('NOT NULL'),
    );
  });
});
