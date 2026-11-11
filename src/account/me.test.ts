import { createActor, waitFor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { POLICY_VERSION } from './consent';
import { me } from './me';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { db as database } from '@/storage/database';
import { consentsGiven, writeSharing } from '@/storage/consent';
import { writeAccount } from '@/storage/account';
import { enqueue } from '@/storage/outbox';
import { outbox, settings } from '@/storage/schema';

// Our server and the network are faked; the machines and what the phone keeps are real.
const fake = vi.hoisted(() => ({ fetch: vi.fn(), reachable: vi.fn(() => true) }));
vi.mock('./auth-client', () => ({ authClient: { $fetch: fake.fetch } }));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isInternetReachable: fake.reachable() }),
}));
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
// The phone's database tells of each change, as expo-sqlite does.
const changes = vi.hoisted(() => ({
  listeners: new Set<(change: { tableName: string }) => void>(),
}));
vi.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (change: { tableName: string }) => void) => {
    changes.listeners.add(listener);
    return { remove: () => changes.listeners.delete(listener) };
  },
}));

/** The server's answers: `/me` with these consents, and yes to everything else. */
function server(consents: { kind: string; policyVersion: string }[] = []) {
  fake.fetch.mockImplementation(async (url: string) =>
    url.endsWith('/me') ? { data: { consents }, error: null } : { data: null, error: null },
  );
}
/** An answer this phone already has. */
const answer = (traces: boolean, policyVersion = POLICY_VERSION) =>
  database().transaction((tx) => writeSharing(tx, { traces, policyVersion }));
const sent = () => fake.fetch.mock.calls.filter(([, init]) => init?.method);

describe('the profile page', () => {
  beforeEach(async () => {
    await migrateDatabase();
    db().delete(settings).run();
    db().delete(outbox).run();
    fake.fetch.mockReset();
    changes.listeners.clear();
    fake.reachable.mockReturnValue(true);
  });

  it('turns sharing off on the server; turning it on goes back when the server says no', async () => {
    answer(true);
    server();
    const actor = createActor(me).start();
    expect(actor.getSnapshot().context.sharing).toBe(true);
    actor.send({ type: 'share', on: false });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(sent().at(-1)?.[1]).toMatchObject({ method: 'PUT', body: { granted: false } });
    expect(consentsGiven()).toEqual([]);
    expect(db().select().from(outbox).all()).toEqual([]);

    // Cancelling what's shared turns nothing on.
    actor.send({ type: 'share', on: true });
    actor.send({ type: 'cancel' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.sharing).toBe(false);
    expect(sent()).toHaveLength(1);

    fake.fetch.mockResolvedValue({ data: null, error: { status: 500, message: 'down' } });
    actor.send({ type: 'share', on: true });
    actor.send({ type: 'agree' });
    const after = await waitFor(actor, (s) => s.matches('idle'));
    expect(after.context).toMatchObject({
      sharing: false,
      error: { about: 'sharing', why: 'failed' },
    });
    expect(consentsGiven()).toEqual([]);
  });

  it('shows sharing off once this phone hears it was turned off elsewhere', () => {
    answer(true);
    const actor = createActor(me).start();
    expect(actor.getSnapshot().context.sharing).toBe(true);
    answer(false);
    for (const listener of changes.listeners) listener({ tableName: 'settings' });
    expect(actor.getSnapshot().context.sharing).toBe(false);
    actor.stop();
    expect(changes.listeners.size).toBe(0);
  });

  it('shows a change heard while a call ran once it ends', async () => {
    answer(true);
    let answerDelete: (answer: unknown) => void = () => {};
    fake.fetch.mockImplementation(() => new Promise((resolve) => (answerDelete = resolve)));
    const actor = createActor(me).start();
    actor.send({ type: 'delete' });
    answer(false);
    for (const listener of changes.listeners) listener({ tableName: 'settings' });
    answerDelete({ data: null, error: { status: 500, message: 'down' } });
    const after = await waitFor(actor, (s) => s.matches('idle'));
    expect(after.context.sharing).toBe(false);
  });

  it('turning sharing off offline stops it on this phone and queues it for the server', async () => {
    answer(true);
    fake.fetch.mockRejectedValue(new Error('fetch failed: Unable to resolve host'));
    const actor = createActor(me).start();
    actor.send({ type: 'share', on: false });
    const after = await waitFor(actor, (s) => s.matches('idle'));
    expect(after.context).toMatchObject({ sharing: false, error: null });
    expect(consentsGiven()).toEqual([]);
    expect(db().select().from(outbox).all()).toMatchObject([
      { entity: 'consent', op: 'withdraw', payload: { policyVersion: POLICY_VERSION } },
    ]);

    // Back online, sharing again: the queued withdrawal mustn't undo it later.
    server();
    actor.send({ type: 'share', on: true });
    actor.send({ type: 'agree' });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(consentsGiven()).toEqual([`traces@${POLICY_VERSION}`]);
    expect(db().select().from(outbox).all()).toEqual([]);
  });

  it('hands over to startup only once the server deleted the account', async () => {
    const deleted = vi.fn();
    fake.fetch.mockRejectedValueOnce(new Error('fetch failed: Unable to resolve host'));
    fake.reachable.mockReturnValue(false);
    const actor = createActor(me.provide({ actions: { deleted } })).start();
    actor.send({ type: 'delete' });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(actor.getSnapshot().context.error).toEqual({ about: 'deleting', why: 'offline' });
    expect(deleted).not.toHaveBeenCalled();

    server();
    actor.send({ type: 'delete' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(sent().at(-1)).toEqual([expect.stringMatching(/\/account$/), { method: 'DELETE' }]);
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it('signs out once nothing would be lost: offline it waits, and refused changes need Sign out anyway', async () => {
    const signedOut = vi.fn();
    database().transaction((tx) => {
      writeAccount(tx, { id: 'ann', name: 'Ann Lee', image: null });
      enqueue(tx, { entity: 'workout', entityId: 'w1', op: 'done', data: {} });
    });
    fake.fetch.mockRejectedValue(new Error('fetch failed: Unable to resolve host'));
    fake.reachable.mockReturnValue(false);
    const actor = createActor(me.provide({ actions: { signedOut } })).start();
    actor.send({ type: 'signOut' });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(actor.getSnapshot().context.error).toEqual({ about: 'signingOut', why: 'offline' });
    expect(db().select().from(outbox).all()).toHaveLength(1);

    // Online, the server refuses the workout: signing out would lose it, so it's said first.
    fake.reachable.mockReturnValue(true);
    fake.fetch.mockResolvedValue({ data: { results: [{ ok: false, reason: 'day: Invalid' }] } });
    actor.send({ type: 'signOut' });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(actor.getSnapshot().context).toMatchObject({ refused: 1, error: null });
    expect(signedOut).not.toHaveBeenCalled();

    actor.send({ type: 'signOut', anyway: true });
    await waitFor(actor, (s) => s.status === 'done');
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the server already ended the session: startup keeps what was unsent', async () => {
    const signedOut = vi.fn();
    database().transaction((tx) => {
      writeAccount(tx, { id: 'ann', name: 'Ann Lee', image: null });
      enqueue(tx, { entity: 'workout', entityId: 'w1', op: 'done', data: {} });
    });
    fake.fetch.mockResolvedValue({ data: null, error: { status: 401, message: 'signed out' } });
    const actor = createActor(me.provide({ actions: { signedOut } })).start();
    actor.send({ type: 'signOut' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(signedOut).toHaveBeenCalledTimes(1);
  });
});
