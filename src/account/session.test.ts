import { createActor, toPromise } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { checkSession, signOut } from './session';
import { keepAccount } from './store';
import { account } from '@/storage/account';
import { migrateDatabase } from '@/storage/__fixtures__/database';

vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, Directory: class {} }));
const getSession = vi.fn();
const serverSignOut = vi.fn();
vi.mock('./auth-client', () => ({
  authClient: { getSession: () => getSession(), signOut: () => serverSignOut() },
}));
const googleSignOut = vi.fn();
vi.mock('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: { signOut: () => googleSignOut() },
}));

const check = () => toPromise(createActor(checkSession).start());
const ann = { id: 'ann', name: 'Ann Lee', image: null };

describe('the session check at launch', () => {
  beforeEach(async () => {
    await migrateDatabase();
    keepAccount(ann);
  });

  it('changes nothing offline: the client throws when the server is out of reach', async () => {
    getSession.mockRejectedValue(new Error('fetch failed: Unable to resolve host'));
    expect(await check()).toBe('unknown');
    expect(account()).toMatchObject({ id: 'ann', signedOut: false });
  });

  it('marks you signed out, data kept, only when the server says the session is gone', async () => {
    getSession.mockResolvedValue({ data: null, error: { status: 500 } });
    expect(await check()).toBe('unknown');
    expect(account()?.signedOut).toBe(false);

    getSession.mockResolvedValue({ data: null, error: null });
    expect(await check()).toBe('gone');
    expect(account()).toMatchObject({ id: 'ann', signedOut: true });
  });

  it('never takes in another account: that would clear the database under open screens', async () => {
    getSession.mockResolvedValue({
      data: { user: { id: 'bob', name: 'Bob Day', image: null } },
      error: null,
    });
    expect(await check()).toBe('unknown');
    expect(account()).toMatchObject({ id: 'ann', name: 'Ann Lee' });
  });

  it('brings your name and photo up to date', async () => {
    getSession.mockResolvedValue({
      data: { user: { id: 'ann', name: 'Ann Lee-Smith', image: 'https://photo/ann' } },
      error: null,
    });
    expect(await check()).toBe('ok');
    expect(account()).toMatchObject({ name: 'Ann Lee-Smith', image: 'https://photo/ann' });
  });

  it('signs you out on this phone at once, offline too, keeping your data for when you sign in again', async () => {
    serverSignOut.mockRejectedValue(new Error('fetch failed: Unable to resolve host'));
    googleSignOut.mockRejectedValue(new Error('no network'));
    await toPromise(createActor(signOut).start());
    expect(account()).toMatchObject({ id: 'ann', signedOut: true });
    expect(serverSignOut).toHaveBeenCalled();
  });
});
