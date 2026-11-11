import { createActor, waitFor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { heardOff, POLICY_VERSION } from './consent';
import { me, notSent, refusedText, sharingShown } from './me';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { db as database } from '@/storage/database';
import { consentsGiven, sharing, writeSharing } from '@/storage/consent';
import { account, writeAccount } from '@/storage/account';
import { enqueue } from '@/storage/outbox';
import { outbox, settings } from '@/storage/schema';

// Our server and the network are faked; the machines and what the phone keeps are real.
const fake = vi.hoisted(() => ({ fetch: vi.fn(), reachable: vi.fn(() => true) }));
vi.mock('./auth-client', () => ({ authClient: { $fetch: fake.fetch } }));
vi.mock('expo-file-system', () => ({}));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isInternetReachable: fake.reachable() }),
}));
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));

/** The server's answers: `/me` with these consents, and yes to everything else. */
function server(consents: { kind: string; policyVersion: string }[] = []) {
  fake.fetch.mockImplementation(async (url: string) =>
    url.endsWith('/me') ? { data: { consents }, error: null } : { data: null, error: null },
  );
}
/** An answer this phone already has. */
const answer = (traces: boolean, policyVersion = POLICY_VERSION) =>
  database().transaction((tx) => writeSharing(tx, { traces, policyVersion }));
/** Where the switch stands, with the answer read as the shared snapshot reads it. */
const shown = (actor: ReturnType<typeof createActor<typeof me>>) =>
  sharingShown(actor.getSnapshot(), sharing());
const sent = () => fake.fetch.mock.calls.filter(([, init]) => init?.method);

describe('the profile page', () => {
  beforeEach(async () => {
    await migrateDatabase();
    db().delete(settings).run();
    db().delete(outbox).run();
    fake.fetch.mockReset();
    fake.reachable.mockReturnValue(true);
  });

  it('turns sharing off on the server; turning it on goes back when the server says no', async () => {
    answer(true);
    server();
    const actor = createActor(me).start();
    expect(shown(actor)).toBe(true);
    actor.send({ type: 'share', on: false });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(sent().at(-1)?.[1]).toMatchObject({ method: 'PUT', body: { granted: false } });
    expect(consentsGiven()).toEqual([]);
    expect(db().select().from(outbox).all()).toEqual([]);

    // Cancelling what's shared turns nothing on.
    actor.send({ type: 'share', on: true });
    actor.send({ type: 'cancel' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(shown(actor)).toBe(false);
    expect(sent()).toHaveLength(1);

    fake.fetch.mockResolvedValue({ data: null, error: { status: 500, message: 'down' } });
    actor.send({ type: 'share', on: true });
    actor.send({ type: 'agree' });
    const after = await waitFor(actor, (s) => s.matches('idle'));
    expect(after.context.error).toBe('failed');
    expect(shown(actor)).toBe(false);
    expect(consentsGiven()).toEqual([]);
  });

  it('shows the new place while the call runs, then what this phone keeps, sharing turned off elsewhere too', async () => {
    let answerShare: (answer: unknown) => void = () => {};
    fake.fetch.mockImplementation(() => new Promise((resolve) => (answerShare = resolve)));
    const actor = createActor(me).start();
    actor.send({ type: 'share', on: true });
    actor.send({ type: 'agree' });
    expect(shown(actor)).toBe(true);
    expect(consentsGiven()).toEqual([]);
    await vi.waitFor(() => expect(fake.fetch).toHaveBeenCalled());
    answerShare({ data: null, error: null });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(shown(actor)).toBe(true);

    // The server says it was turned off on another phone: the switch follows, though nothing ran here.
    server();
    await heardOff();
    expect(shown(actor)).toBe(false);
  });

  it('after a call went through, the switch holds its place a moment, then shows what is kept', async () => {
    answer(true);
    server();
    const actor = createActor(me).start();
    const before = sharing();
    actor.send({ type: 'share', on: false });
    await waitFor(actor, (s) => s.matches('settling'));
    // The snapshot's live query hasn't read the row again yet: the switch doesn't jump back on.
    expect(sharingShown(actor.getSnapshot(), before)).toBe(false);
    expect(actor.getSnapshot().can({ type: 'share', on: true })).toBe(false);

    await waitFor(actor, (s) => s.matches('idle'));
    expect(shown(actor)).toBe(false);
  });

  it('a withdrawal heard after you turned sharing on from a kept no shows the switch off', async () => {
    answer(false);
    server();
    const actor = createActor(me).start();
    actor.send({ type: 'share', on: true });
    actor.send({ type: 'agree' });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(shown(actor)).toBe(true);

    // Withdrawn on another phone: the server has no yes, and this phone hears it.
    await heardOff();
    expect(sharing()?.traces).toBe(false);
    expect(shown(actor)).toBe(false);
  });

  it('turning sharing off offline stops it on this phone and queues it for the server', async () => {
    answer(true);
    fake.fetch.mockRejectedValue(new Error('fetch failed: Unable to resolve host'));
    const actor = createActor(me).start();
    actor.send({ type: 'share', on: false });
    const after = await waitFor(actor, (s) => s.matches('idle'));
    expect(after.context.error).toBeNull();
    expect(shown(actor)).toBe(false);
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
    actor.send({ type: 'askDelete' });
    actor.send({ type: 'delete' });
    await waitFor(actor, (s) => s.matches({ deleting: 'asking' }) && s.context.error !== null);
    expect(actor.getSnapshot().context.error).toBe('offline');
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
    const asked = () => waitFor(actor, (s) => s.matches({ signingOut: 'asking' }));
    actor.send({ type: 'askSignOut' });
    actor.send({ type: 'signOut' });
    // While it runs, the dialog's buttons are off: it says so.
    expect(actor.getSnapshot().can({ type: 'signOut' })).toBe(false);
    await asked();
    expect(actor.getSnapshot().context).toMatchObject({ error: 'offline', unsent: 1 });
    expect(db().select().from(outbox).all()).toHaveLength(1);

    // Closed and opened again later: nothing was tried yet, so nothing is said.
    actor.send({ type: 'cancel' });
    actor.send({ type: 'askSignOut' });
    expect(actor.getSnapshot().context).toMatchObject({ error: null, unsent: 0 });

    // Online, the server refuses the workout: signing out would lose it, so it's said first.
    fake.reachable.mockReturnValue(true);
    fake.fetch.mockResolvedValue({ data: { results: [{ ok: false, reason: 'day: Invalid' }] } });
    actor.send({ type: 'signOut' });
    await waitFor(actor, (s) => s.matches({ signingOut: 'asking' }) && s.context.refused > 0);
    expect(actor.getSnapshot().context).toMatchObject({ refused: 1, error: null });
    expect(signedOut).not.toHaveBeenCalled();

    // Opened again, it asks plainly first: the refusal is named again once it's tried.
    actor.send({ type: 'cancel' });
    actor.send({ type: 'askSignOut' });
    expect(actor.getSnapshot().context.refused).toBe(0);
    actor.send({ type: 'signOut' });
    await waitFor(actor, (s) => s.matches({ signingOut: 'asking' }) && s.context.refused > 0);

    // The next tap is Sign out anyway.
    actor.send({ type: 'signOut' });
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
    actor.send({ type: 'askSignOut' });
    actor.send({ type: 'signOut' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it("a delete whose answer was lost, retried after the session went with the account, says you're signed out", async () => {
    const deleted = vi.fn();
    database().transaction((tx) => writeAccount(tx, { id: 'ann', name: 'Ann Lee', image: null }));
    fake.fetch.mockRejectedValueOnce(new Error('Network request failed'));
    const actor = createActor(me.provide({ actions: { deleted } })).start();
    actor.send({ type: 'askDelete' });
    actor.send({ type: 'delete' });
    await waitFor(actor, (s) => s.matches({ deleting: 'asking' }) && s.context.error !== null);
    expect(actor.getSnapshot().context.error).toBe('failed');

    fake.fetch.mockResolvedValue({ data: null, error: { status: 401, message: 'Unauthorized' } });
    actor.send({ type: 'delete' });
    await waitFor(actor, (s) => s.matches('ended'));
    // The next launch asks you to sign in; nothing here is cleared.
    expect(account()).toMatchObject({ id: 'ann', signedOut: true });
    expect(deleted).not.toHaveBeenCalled();
  });

  it('turning sharing on when the session is gone says so instead of "try again"', async () => {
    fake.fetch.mockResolvedValue({ data: null, error: { status: 401, message: 'Unauthorized' } });
    const actor = createActor(me).start();
    actor.send({ type: 'share', on: true });
    actor.send({ type: 'agree' });
    await waitFor(actor, (s) => s.matches('ended'));
    expect(shown(actor)).toBe(false);
  });
});

describe('what the Sign out dialog says', () => {
  it('names what is unsent, one or many', () => {
    expect(notSent('No internet.', 1)).toBe(
      "No internet.\n\nYour last 1 workout isn't saved to your account yet. Sign out once it is.",
    );
    expect(notSent('No internet.', 3)).toBe(
      "No internet.\n\nYour last 3 workouts aren't saved to your account yet. Sign out once they are.",
    );
    expect(notSent('No internet.', 0)).toBe(
      "No internet.\n\nYour latest changes aren't saved to your account yet. Sign out once they are.",
    );
    expect(refusedText(1)).toBe(
      "1 change couldn't be saved to your account. Signing out loses it.",
    );
    expect(refusedText(2)).toBe(
      "2 changes couldn't be saved to your account. Signing out loses them.",
    );
  });
});
