import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { setSharing } from './consent';
import { SessionGone } from './server';
import { keepSignIn, markSignedOut } from './store';
import { refused, restored, send, sync } from './sync';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { db as database } from '@/storage/database';
import { account, writeAccount } from '@/storage/account';
import { clearDatabase } from '@/storage/clear';
import { enqueue } from '@/storage/outbox';
import * as schema from '@/storage/schema';

// Our server is faked; what the phone keeps is real SQLite.
type Init = {
  method?: string;
  body?: { changes?: { entityId: string }[]; granted?: boolean };
};
const fake = vi.hoisted(() => ({ fetch: vi.fn<(url: string, init?: Init) => Promise<unknown>>() }));
vi.mock('./auth-client', () => ({ authClient: { $fetch: fake.fetch } }));
vi.mock('expo-file-system', () => ({}));
vi.mock('expo-network', () => ({}));
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));

const offline = () => Promise.reject(new TypeError('Network request failed'));
/** The changes each POST carried. */
const sent = () =>
  fake.fetch.mock.calls.flatMap(([, init]) =>
    init?.body?.changes ? [init.body.changes.map((c) => c.entityId)] : [],
  );
const queue = (entity: string, entityId: string) =>
  database().transaction((tx) =>
    enqueue(tx, { entity, entityId, op: 'add', data: { id: entityId } }),
  );
const outbox = () => db().select().from(schema.outbox).all();

const version = {
  id: 'v1',
  challengeId: 'c1',
  number: 1,
  name: 'Morning squats',
  days: 30,
  dailyTotal: false,
  restartOnMiss: true,
  plan: [{ steps: [{ exercise: 'squat', goal: { type: 'reps', n: 10 } }], rounds: 3 }],
  createdAt: 1,
};
const challenge = {
  id: 'c1',
  owner: 'local',
  visibility: 'private' as const,
  currentVersionId: 'v1',
};
const run = {
  id: 'r1',
  challengeId: 'c1',
  pinnedVersionId: null,
  groupChallengeId: null,
  startedOn: '2026-11-10',
  endedOn: null,
  endReason: null,
};
const workout = {
  id: 'w1',
  runId: 'r1',
  versionId: 'v1',
  day: '2026-11-11',
  status: 'done',
  startedAt: 1,
  endedAt: 2,
  tzOffsetMin: 120,
  tz: 'Europe/Tallinn',
  appVersion: '1.0.0',
  sets: [
    {
      id: 's1',
      workoutId: 'w1',
      planStep: 0,
      exercise: 'squat',
      goal: { type: 'reps', n: 10 },
      reps: 10,
      noReps: 0,
      heldMs: 0,
      startedAt: 1,
      endedAt: 2,
      counterVersion: '1.0.0',
      attempts: [],
      metrics: null,
    },
  ],
};

/** The server: takes every change, and answers pulls with these pages by cursor. */
function server(pages: Record<string, object>) {
  fake.fetch.mockImplementation(async (url: string, init?: Init) => {
    if (init?.method === 'PUT') return { data: null, error: null };
    if (init?.body?.changes)
      return { data: { results: init.body.changes.map(() => ({ ok: true })) } };
    const after = new URL(url).searchParams.get('after') ?? '';
    const page = pages[after];
    return page ? { data: page } : offline();
  });
}

describe('sync: the outbox goes up, the account comes down', () => {
  beforeEach(async () => {
    // Empty, signed in as `local`.
    await migrateDatabase();
    database().transaction((tx) => clearDatabase(tx));
    await migrateDatabase();
    fake.fetch.mockReset();
  });

  it("keeps what it couldn't send while offline, and sends it once back online", async () => {
    queue('streak_event', 'used:2026-11-09');
    queue('streak_event', 'used:2026-11-10');
    fake.fetch.mockImplementation(offline);
    await expect(send()).rejects.toThrow('Network request failed');
    expect(outbox()).toHaveLength(2);

    fake.fetch.mockReset();
    server({});
    await send();
    expect(outbox()).toEqual([]);
    expect(sent()).toEqual([['used:2026-11-09', 'used:2026-11-10']]);
    // Nothing waiting: nothing goes out.
    await send();
    expect(sent()).toHaveLength(1);
  });

  it('parks a change the server refused with its reason, and the rest go on', async () => {
    queue('streak_event', 'a');
    queue('streak_event', 'b');
    queue('streak_event', 'c');
    fake.fetch.mockResolvedValue({
      data: { results: [{ ok: true }, { ok: false, reason: 'day: Invalid' }, { ok: true }] },
    });
    await send();
    expect(outbox()).toEqual([
      expect.objectContaining({ entityId: 'b', lastError: 'day: Invalid' }),
    ]);
    expect(refused()).toBe(1);

    queue('streak_event', 'd');
    server({});
    await send();
    expect(sent().at(-1)).toEqual(['d']);
    expect(outbox().map((row) => row.entityId)).toEqual(['b']);

    // Long workouts queued offline go over the server's 1 MB together: they go one at a time, and one too
    // large alone is refused like any other.
    queue('workout', 'long');
    queue('workout', 'huge');
    queue('workout', 'short');
    fake.fetch.mockImplementation(async (_url, init) => {
      const changes = init?.body?.changes ?? [];
      return changes.length > 1 || changes[0]?.entityId === 'huge'
        ? { data: null, error: { status: 413, message: 'Payload Too Large' } }
        : { data: { results: [{ ok: true }] } };
    });
    await send();
    expect(outbox().map((row) => [row.entityId, row.lastError])).toEqual([
      ['b', 'day: Invalid'],
      ['huge', 'over 1 MB'],
    ]);
  });

  it('pulls the account back page by page, children before their parents; a cut-off pull resumes', async () => {
    // The challenge was edited later, so its row comes after its run and workout, a page later.
    const first = {
      rows: [
        { entity: 'challenge_version', row: version },
        { entity: 'run', row: run },
        { entity: 'workout', row: workout },
      ],
      cursor: 3,
      more: true,
    };
    const second = { rows: [{ entity: 'challenge', row: challenge }], cursor: 4, more: false };
    server({ '0': first });
    await expect(sync()).rejects.toThrow();
    expect(db().select().from(schema.sets).all()).toHaveLength(1);
    expect(restored()).toBe(false);

    server({ '3': second });
    await sync();
    expect(db().select().from(schema.challenges).all()).toEqual([
      expect.objectContaining({ id: 'c1', owner: 'local', currentVersionId: 'v1' }),
    ]);
    expect(db().select().from(schema.workouts).all()).toEqual([
      expect.objectContaining({ id: 'w1', status: 'done', runId: 'r1' }),
    ]);
    expect(restored()).toBe(true);
    // Every reference holds once the pull is whole.
    expect(db().all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });

  it('never lets a pulled row undo a change of this phone not sent yet', async () => {
    db().insert(schema.challenges).values(challenge).run();
    db().insert(schema.challengeVersions).values(version).run();
    db().insert(schema.runs).values(run).run();
    // You leave the run while the pull is on its way with the server's copy, still going.
    fake.fetch.mockImplementation(async () => {
      database().transaction((tx) => {
        tx.update(schema.runs).set({ endedOn: '2026-11-11', endReason: 'left' }).run();
        enqueue(tx, { entity: 'run', entityId: 'r1', op: 'leave', data: {} });
      });
      return { data: { rows: [{ entity: 'run', row: run }], cursor: 1, more: false } };
    });
    await sync();
    expect(db().select().from(schema.runs).all()).toEqual([
      expect.objectContaining({ endedOn: '2026-11-11' }),
    ]);
  });

  it("sends a withdrawal of sharing made offline first, and fails the round while it can't", async () => {
    fake.fetch.mockImplementation(offline);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await setSharing(false);
    expect(outbox()).toMatchObject([{ entity: 'consent', op: 'withdraw' }]);

    fake.fetch.mockResolvedValue({ data: null, error: { status: 500, message: 'down' } });
    await expect(send()).rejects.toThrow('down');
    expect(outbox()).toHaveLength(1);

    fake.fetch.mockReset();
    server({});
    await send();
    expect(fake.fetch.mock.calls.at(-1)?.[1]).toMatchObject({
      method: 'PUT',
      body: { granted: false },
    });
    expect(outbox()).toEqual([]);
  });

  it('a pull answered after you signed out keeps nothing, even for the same account signing in again', async () => {
    const page = { rows: [{ entity: 'run', row: run }], cursor: 9, more: false };
    // Another account after a first pull; the same account part way through one.
    for (const [next, cursor] of [
      [{ id: 'bob', name: 'Bob Day', image: null }, null],
      [{ id: 'local', name: 'You', image: null }, '5'],
    ] as const) {
      database().transaction((tx) => {
        clearDatabase(tx);
        writeAccount(tx, { id: 'local', name: 'You', image: null });
      });
      if (cursor) db().insert(schema.syncCursors).values({ stream: 'changes', cursor }).run();
      let answer: (value: unknown) => void = () => {};
      fake.fetch.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const pulling = sync();
      await vi.waitFor(() => expect(fake.fetch).toHaveBeenCalled());
      // Signed out (the database cleared), and someone signed in.
      database().transaction((tx) => {
        clearDatabase(tx);
        writeAccount(tx, next);
      });
      answer({ data: page });
      await pulling;
      expect(db().select().from(schema.runs).all()).toEqual([]);
      expect(db().select().from(schema.syncCursors).all()).toEqual([]);
      expect(restored()).toBe(false);
      fake.fetch.mockReset();
    }
  });

  it('runs a send and a pull one at a time: a send waits for the round before it', async () => {
    queue('streak_event', 'a');
    const calls: string[] = [];
    let answerSend: () => void = () => {};
    fake.fetch.mockImplementation(async (url: string, init?: Init) => {
      calls.push(init?.method ?? 'GET');
      if (init?.body?.changes) {
        const results = init.body.changes.map(() => ({ ok: true }));
        await new Promise<void>((resolve) => (answerSend = resolve));
        return { data: { results } };
      }
      return { data: { rows: [], cursor: 0, more: false } };
    });
    const round = sync();
    const another = send();
    await vi.waitFor(() => expect(calls).toEqual(['POST']));
    answerSend();
    await Promise.all([round, another]);
    // The queued row went once; the second send found nothing waiting.
    expect(calls).toEqual(['POST', 'GET']);
  });

  it('a session gone marks its account signed out, but never one that signed in meanwhile', async () => {
    queue('streak_event', 'a');
    let answer: (value: unknown) => void = () => {};
    fake.fetch.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const sending = send();
    await vi.waitFor(() => expect(fake.fetch).toHaveBeenCalled());
    database().transaction((tx) => writeAccount(tx, { id: 'bob', name: 'Bob Day', image: null }));
    answer({ data: null, error: { status: 401, message: 'Unauthorized' } });
    await expect(sending).rejects.toBeInstanceOf(SessionGone);
    expect(account()).toMatchObject({ id: 'bob', signedOut: false });

    fake.fetch.mockResolvedValue({ data: null, error: { status: 401, message: 'Unauthorized' } });
    await expect(send()).rejects.toBeInstanceOf(SessionGone);
    expect(account()).toMatchObject({ id: 'bob', signedOut: true });
  });

  it('a session gone leaves alone the same account signed in again meanwhile', async () => {
    queue('streak_event', 'a');
    let answer: (value: unknown) => void = () => {};
    fake.fetch.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const sending = send();
    await vi.waitFor(() => expect(fake.fetch).toHaveBeenCalled());
    // Another call found the session gone; you signed in again as yourself.
    const kept = account();
    if (!kept) throw new Error('no account');
    markSignedOut();
    keepSignIn(kept);
    answer({ data: null, error: { status: 401, message: 'Unauthorized' } });
    await expect(sending).rejects.toBeInstanceOf(SessionGone);
    expect(account()).toMatchObject({ id: kept.id, signedOut: false });
  });
});
