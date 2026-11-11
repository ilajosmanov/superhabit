import { createActor, waitFor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { signIn } from './sign-in';
import { account } from '@/storage/account';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { challenges, settings, workouts } from '@/storage/schema';
import { keepAccount } from './store';

// Google's sheet, our server and the network are faked; the machine and the kept account are real.
const fake = vi.hoisted(() => ({
  google: {
    configure: vi.fn(),
    signIn: vi.fn(),
    createAccount: vi.fn(),
    presentExplicitSignIn: vi.fn(),
    signOut: vi.fn(async () => {}),
  },
  social: vi.fn(),
  serverSignOut: vi.fn(async () => {}),
  reachable: vi.fn(),
}));
vi.mock('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: fake.google,
  isNoSavedCredentialFoundResponse: (r: { type: string }) => r.type === 'noSavedCredentialFound',
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
}));
vi.mock('./auth-client', () => ({
  authClient: { signIn: { social: fake.social }, signOut: fake.serverSignOut },
}));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isInternetReachable: fake.reachable() }),
}));
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('expo-file-system', () => ({}));

const picked = { type: 'success', data: { idToken: 'google-id-token' } };
const none = { type: 'noSavedCredentialFound', data: null };
const ann = { id: 'ann', name: 'Ann Lee', image: 'https://photo/ann' };
const accepted = { data: { redirect: false, token: 't', user: ann }, error: null };

function tap() {
  const actor = createActor(signIn).start();
  actor.send({ type: 'press' });
  return actor;
}
const settled = (actor: ReturnType<typeof tap>) =>
  waitFor(actor, (s) => s.matches('idle') || s.status === 'done');

describe('signing in', () => {
  beforeEach(async () => {
    await migrateDatabase();
    // The first launch: nobody kept yet.
    db().delete(settings).run();
  });

  it("keeps the account Google picks once our server accepts Google's token", async () => {
    fake.google.signIn.mockResolvedValue(picked);
    fake.social.mockResolvedValue(accepted);
    const actor = tap();
    expect((await settled(actor)).status).toBe('done');
    expect(fake.social).toHaveBeenCalledWith({
      provider: 'google',
      idToken: { token: 'google-id-token' },
    });
    expect(account()).toMatchObject(ann);
  });

  it('offers any account on the phone when none was used here before', async () => {
    fake.google.signIn.mockResolvedValue(none);
    fake.google.createAccount.mockResolvedValue(none);
    fake.google.presentExplicitSignIn.mockResolvedValue(picked);
    fake.social.mockResolvedValue(accepted);
    expect((await settled(tap())).status).toBe('done');
    expect(account()?.id).toBe('ann');
  });

  it("goes back to the button when you close Google's sheet, saying nothing", async () => {
    fake.google.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    const idle = await settled(tap());
    expect(idle.context.error).toBeNull();
    expect(account()).toBeNull();
  });

  it('says why it failed, offline or not, and a second tap tries again', async () => {
    fake.google.signIn.mockResolvedValue(picked);
    fake.social.mockResolvedValue({ data: null, error: { status: 401, message: 'Invalid token' } });
    fake.reachable.mockReturnValue(true);
    const actor = tap();
    expect((await settled(actor)).context.error).toBe('failed');

    fake.social.mockRejectedValue(new Error('fetch failed: Unable to resolve host'));
    fake.reachable.mockReturnValue(false);
    actor.send({ type: 'press' });
    await waitFor(actor, (s) => s.matches('signingIn'));
    expect((await settled(actor)).context.error).toBe('offline');
    expect(account()).toBeNull();

    fake.social.mockResolvedValue(accepted);
    actor.send({ type: 'press' });
    expect((await settled(actor)).status).toBe('done');
    expect(account()?.id).toBe('ann');
  });

  it("asks before another account's workouts are cleared, and keeps them when you say so", async () => {
    keepAccount({ id: 'bob', name: 'Bob Day', image: null });
    db()
      .insert(workouts)
      .values({
        id: 'w',
        day: '2026-11-10',
        status: 'done',
        startedAt: 1,
        tzOffsetMin: 0,
        tz: 'UTC',
        appVersion: '1.0.0',
      })
      .run();
    fake.google.signIn.mockResolvedValue(picked);
    fake.social.mockResolvedValue(accepted);

    const actor = tap();
    const asking = await waitFor(actor, (s) => s.matches('asking'));
    expect(asking.context.replacing).toBe('Bob Day');
    // A late sign-out answer must not land after the next sign-in: the button waits for it.
    let answer = () => {};
    fake.serverSignOut.mockReturnValueOnce(new Promise<void>((resolve) => (answer = resolve)));
    actor.send({ type: 'keepTheirs' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().matches('forgetting')).toBe(true);
    answer();
    await waitFor(actor, (s) => s.matches('idle'));
    expect(account()?.id).toBe('bob');
    expect(db().select().from(workouts).all()).toHaveLength(1);
    expect(fake.serverSignOut).toHaveBeenCalled();

    actor.send({ type: 'press' });
    await waitFor(actor, (s) => s.matches('asking'));
    actor.send({ type: 'replace' });
    expect((await settled(actor)).status).toBe('done');
    expect(account()?.id).toBe('ann');
    expect(db().select().from(workouts).all()).toEqual([]);
  });

  it('asks too when the other account has only a challenge it made, not just done workouts', async () => {
    keepAccount({ id: 'bob', name: 'Bob Day', image: null });
    db()
      .insert(challenges)
      .values({ id: 'c', owner: 'bob', visibility: 'private', currentVersionId: 'v' })
      .run();
    fake.google.signIn.mockResolvedValue(picked);
    fake.social.mockResolvedValue(accepted);
    const actor = tap();
    expect((await waitFor(actor, (s) => s.matches('asking') || s.status === 'done')).value).toBe(
      'asking',
    );
    actor.stop();
  });

  it('after Sign out, ends the old session before the button works again', async () => {
    let answer = () => {};
    fake.serverSignOut.mockReturnValueOnce(new Promise<void>((resolve) => (answer = resolve)));
    const actor = createActor(signIn, { input: { leaving: true } }).start();
    expect(actor.getSnapshot().matches('forgetting')).toBe(true);
    actor.send({ type: 'press' });
    expect(actor.getSnapshot().matches('forgetting')).toBe(true);
    answer();
    await waitFor(actor, (s) => s.matches('idle'));
    expect(fake.google.signOut).toHaveBeenCalled();
    actor.stop();
  });
});
