import { createActor, waitFor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { consent, POLICY_VERSION } from './consent';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { db as database } from '@/storage/database';
import { consentsGiven, sharing, writeSharing } from '@/storage/consent';
import { settings } from '@/storage/schema';

// Our server and the network are faked; the machines and what the phone keeps are real.
const fake = vi.hoisted(() => ({ fetch: vi.fn(), reachable: vi.fn(() => true) }));
vi.mock('./auth-client', () => ({ authClient: { $fetch: fake.fetch } }));
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
const sent = () => fake.fetch.mock.calls.filter(([, init]) => init?.method);
const asked = (actor: ReturnType<typeof createActor<typeof consent>>) =>
  waitFor(actor, (s) => s.matches('asking') || s.status === 'done');

describe('the consent question after sign-in', () => {
  beforeEach(async () => {
    await migrateDatabase();
    db().delete(settings).run();
    fake.fetch.mockReset();
    fake.reachable.mockReturnValue(true);
  });

  it('asks a new account, and Share gives it on the server and keeps it here', async () => {
    server();
    const actor = createActor(consent).start();
    expect((await asked(actor)).value).toBe('asking');
    actor.send({ type: 'agree' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(sent()).toEqual([
      [
        expect.stringMatching(/\/consent$/),
        {
          method: 'PUT',
          body: { kind: 'traces', policyVersion: POLICY_VERSION, granted: true },
        },
      ],
    ]);
    expect(consentsGiven()).toEqual([`traces@${POLICY_VERSION}`]);
  });

  it("doesn't ask when it was given on another phone", async () => {
    server([{ kind: 'traces', policyVersion: POLICY_VERSION }]);
    expect((await asked(createActor(consent).start())).status).toBe('done');
    expect(sharing()?.traces).toBe(true);
  });

  it("doesn't ask again on this phone, even after Not now; a new privacy policy asks again", async () => {
    answer(false);
    expect((await asked(createActor(consent).start())).status).toBe('done');
    expect(fake.fetch).not.toHaveBeenCalled();

    answer(true, '2020-01-01');
    server([{ kind: 'traces', policyVersion: '2020-01-01' }]);
    expect((await asked(createActor(consent).start())).value).toBe('asking');
    // Until you answer again, trace files say what you agreed to.
    expect(consentsGiven()).toEqual(['traces@2020-01-01']);
  });

  it('Not now keeps the answer here and tells the server nothing', async () => {
    server();
    const actor = createActor(consent).start();
    await asked(actor);
    actor.send({ type: 'notNow' });
    await waitFor(actor, (s) => s.status === 'done');
    expect(sent()).toEqual([]);
    expect(sharing()?.traces).toBe(false);
  });

  it('offline, Share says so and asks again; nothing is kept', async () => {
    server();
    const actor = createActor(consent).start();
    await asked(actor);
    fake.fetch.mockRejectedValue(new Error('fetch failed: Unable to resolve host'));
    fake.reachable.mockReturnValue(false);
    actor.send({ type: 'agree' });
    await waitFor(actor, (s) => s.matches('asking') && s.context.error !== null);
    expect(actor.getSnapshot().context.error).toBe('offline');
    expect(sharing()).toBeNull();
  });
});
