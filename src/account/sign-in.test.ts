import { createActor, waitFor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { signIn } from './sign-in';
import { account } from '@/storage/account';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { settings } from '@/storage/schema';

// Google's sheet, our server and the network are faked; the machine and the kept account are real.
const fake = vi.hoisted(() => ({
  google: {
    configure: vi.fn(),
    signIn: vi.fn(),
    createAccount: vi.fn(),
    presentExplicitSignIn: vi.fn(),
  },
  social: vi.fn(),
  reachable: vi.fn(),
}));
vi.mock('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: fake.google,
  isNoSavedCredentialFoundResponse: (r: { type: string }) => r.type === 'noSavedCredentialFound',
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
}));
vi.mock('./auth-client', () => ({ authClient: { signIn: { social: fake.social } } }));
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
});
