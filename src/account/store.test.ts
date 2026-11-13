import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { forgetAccount, keepAccount, markSignedOut } from './store';
import { account, userId } from '@/storage/account';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { subscribeVideos } from '@/storage/set-files';
import { clearDatabase } from '@/storage/clear';
import { db as database } from '@/storage/database';
import * as schema from '@/storage/schema';

vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
// The account folders on the phone: their paths, and which were deleted.
const folders = vi.hoisted((): { deleted: string[] } => ({ deleted: [] }));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  Directory: class {
    path: string;
    exists = true;
    constructor(...parts: string[]) {
      this.path = parts.join('/');
    }
    delete() {
      folders.deleted.push(this.path);
    }
  },
}));

const ann = { id: 'ann', name: 'Ann Lee', image: 'https://photo/ann' };
const bob = { id: 'bob', name: 'Bob Day', image: null };

/** A row in every table, parents before children: a challenge, its version, a run, a workout and its set. */
function train() {
  const d = db();
  d.insert(schema.challenges)
    .values({ id: 'c', owner: 'ann', visibility: 'private', currentVersionId: 'v' })
    .run();
  d.insert(schema.challengeVersions)
    .values({
      id: 'v',
      challengeId: 'c',
      number: 1,
      name: 'Push-ups',
      days: 30,
      dailyTotal: false,
      restartOnMiss: false,
      plan: {},
      createdAt: 1,
    })
    .run();
  d.insert(schema.runs)
    .values({ id: 'r', challengeId: 'c', pinnedVersionId: 'v', startedOn: '2026-11-01' })
    .run();
  d.insert(schema.workouts)
    .values({
      id: 'w',
      runId: 'r',
      versionId: 'v',
      day: '2026-11-01',
      status: 'done',
      startedAt: 1,
      tzOffsetMin: 0,
      tz: 'UTC',
      appVersion: '1.0.0',
    })
    .run();
  d.insert(schema.sets)
    .values({
      id: 's',
      workoutId: 'w',
      planStep: 0,
      exercise: 'pushup',
      goal: {},
      reps: 10,
      noReps: 0,
      heldMs: 0,
      startedAt: 1,
      endedAt: 2,
      counterVersion: '1.0.0',
      attempts: [],
    })
    .run();
  d.insert(schema.streakEvents)
    .values({ id: 'earned:2026-11-01', day: '2026-11-01', kind: 'earned', createdAt: 1 })
    .run();
  d.insert(schema.outbox)
    .values({ entity: 'workout', entityId: 'w', op: 'upsert', payload: {}, createdAt: 1 })
    .run();
}

const rowsLeft = () =>
  Object.values(schema)
    .filter((table) => table !== schema.settings)
    .map((table) => db().select().from(table).all().length);

// Each test starts from an empty database, whatever order they run in.
beforeEach(async () => {
  await migrateDatabase();
  database().transaction((tx) => clearDatabase(tx));
});

describe('keeping the account that signed in', () => {
  beforeEach(() => keepAccount(ann));

  it('holds one account: the same account keeps its data, another clears every table', () => {
    train();
    keepAccount({ ...ann, name: 'Ann Lee-Smith' });
    expect(account()?.name).toBe('Ann Lee-Smith');
    expect(db().select().from(schema.sets).all()).toHaveLength(1);

    keepAccount(bob);
    expect(userId()).toBe('bob');
    expect(rowsLeft().every((n) => n === 0)).toBe(true);
    expect(db().select().from(schema.settings).all()).toEqual([{ key: 'account', value: bob }]);
  });

  it('drops what was kept before the first sign-in', () => {
    train();
    db().delete(schema.settings).run();
    expect(account()).toBeNull();
    expect(userId).toThrow();

    keepAccount(ann);
    expect(rowsLeft().every((n) => n === 0)).toBe(true);
  });

  it('keeps the data when the server ends the session, until the same account signs in again', () => {
    train();
    markSignedOut();
    expect(account()).toMatchObject({ id: 'ann', signedOut: true });
    expect(userId()).toBe('ann');

    keepAccount(ann);
    expect(account()?.signedOut).toBe(false);
    expect(db().select().from(schema.sets).all()).toHaveLength(1);
  });
});

describe('deleting the account', () => {
  it('clears the phone: every table, the kept account, and its folder', () => {
    keepAccount(ann);
    train();
    let videosRemoved = false;
    const unsubscribe = subscribeVideos(() => {
      videosRemoved = folders.deleted.includes('documents/ann');
    });
    try {
      forgetAccount();
    } finally {
      unsubscribe();
    }
    expect(videosRemoved).toBe(true);
    expect(rowsLeft().every((n) => n === 0)).toBe(true);
    expect(account()).toBeNull();
    expect(folders.deleted).toEqual(['documents/ann']);
  });
});
