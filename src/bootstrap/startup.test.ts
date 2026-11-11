import { createActor, fromPromise, waitFor } from 'xstate';
import { describe, expect, it, vi } from 'vite-plus/test';
import * as SplashScreen from 'expo-splash-screen';

import { startup } from './startup';
import { consent as consentMachine } from '@/account/consent';
import { signIn as signInMachine } from '@/account/sign-in';
import type { Account } from '@/storage/account';
import { recovery } from '@/workout/recovery';

vi.mock('@/challenges/library', () => ({}));
vi.mock('@/streak/store', () => ({ keepFreezes: () => {} }));
vi.mock('@/storage/database', () => ({}));
// Signed in before, and the server can't be reached: the usual launch.
vi.mock('@/storage/account', () => ({ account: () => ({ id: 'me', name: 'Me', image: null }) }));
vi.mock('@/account/session', async () => {
  const { fromPromise: promise } = await import('xstate');
  return { checkSession: promise(async () => 'unknown'), signOut: promise(async () => {}) };
});
vi.mock('@/account/auth-client', () => ({}));
// The server already gave this phone what it holds, unless a test says otherwise.
const synced = vi.hoisted(() => ({ restored: vi.fn(() => true), sync: vi.fn(async () => {}) }));
vi.mock('@/account/sync', () => ({ restored: synced.restored, sync: synced.sync }));
vi.mock('./keep-synced', async () => {
  const { fromCallback } = await import('xstate');
  return { keepSynced: fromCallback(() => {}) };
});
const videos = vi.hoisted(() => ({ deleteOrphans: vi.fn() }));
vi.mock('@/workout/store', async (original) => ({
  ...(await original<typeof import('@/workout/store')>()),
  deleteOrphanVideos: videos.deleteOrphans,
  findOpenWorkout: () => null,
}));
// This phone has the answer about sharing traces, unless a test says otherwise.
vi.mock('@/account/consent', async (original) => ({
  ...(await original<typeof import('@/account/consent')>()),
  answered: () => true,
}));
vi.mock('react-native-nitro-google-signin', () => ({}));
vi.mock('expo-network', () => ({}));
vi.mock('drizzle-orm/expo-sqlite', () => ({}));
vi.mock('expo-file-system', () => ({}));
vi.mock('superhabit-gzip-file', () => ({}));
vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('expo-splash-screen', () => ({ hide: vi.fn() }));
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

const fine = fromPromise(async () => {});
type Open = { id: string } | null;
const nothingOpen = fromPromise<Open>(async () => null);

describe('startup', () => {
  it('keeps the splash over prepared data until the shared tables have first read', async () => {
    const actor = createActor(
      startup.provide({ actors: { migrate: fine, seed: fine, check: nothingOpen } }),
    ).start();
    // A notification before the database is prepared must not open the gate.
    actor.send({ type: 'dataReady' });
    await waitFor(actor, (s) => s.matches('reading'));
    expect(SplashScreen.hide).not.toHaveBeenCalled();

    actor.send({ type: 'dataReady' });
    expect(actor.getSnapshot().matches('ready')).toBe(true);
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    actor.send({ type: 'dataReady' });
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    actor.stop();
  });

  it('shows a failed start and gets ready on retry, seeding after migrating', async () => {
    let tries = 0;
    const migrate = fromPromise(async () => {
      tries += 1;
      if (tries === 1) throw new Error('unable to open database file');
    });
    let seeded = false;
    const seed = fromPromise(async () => {
      seeded = true;
    });
    const actor = createActor(
      startup.provide({ actors: { migrate, seed, check: nothingOpen } }),
    ).start();

    const failed = await waitFor(actor, (s) => s.matches('failed'));
    expect(failed.context.error).toBe('Error: unable to open database file');
    expect(seeded).toBe(false);
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);

    actor.send({ type: 'retry' });
    await waitFor(actor, (s) => s.matches('reading'));
    actor.send({ type: 'dataReady' });
    await waitFor(actor, (s) => s.matches('ready'));
    expect(seeded).toBe(true);
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    actor.stop();
  });

  it('shows the error with Retry when the first read of the tables fails, and reads again on retry', async () => {
    const actor = createActor(
      startup.provide({ actors: { migrate: fine, seed: fine, check: nothingOpen } }),
    ).start();
    await waitFor(actor, (s) => s.matches('reading'));

    actor.send({ type: 'dataReady', error: 'Error: disk I/O error' });
    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.error).toBe('Error: disk I/O error');

    actor.send({ type: 'retry' });
    await waitFor(actor, (s) => s.matches('reading'));
    actor.send({ type: 'dataReady' });
    expect(actor.getSnapshot().matches('ready')).toBe(true);
    actor.stop();
  });

  it('offers a workout left open before anything shows, and Discard once Save fails', async () => {
    const discarded: string[] = [];
    const actor = createActor(
      startup.provide({
        actors: {
          migrate: fine,
          seed: fine,
          check: fromPromise<Open>(async () => ({ id: 'left' })),
          recovery: recovery.provide({
            actors: {
              save: fromPromise<void, string>(async () => {
                throw new Error('disk full');
              }),
              discard: fromPromise<void, string>(async ({ input }) => {
                discarded.push(input);
              }),
            },
          }),
        },
      }),
    ).start();

    await waitFor(actor, (s) => s.matches('reading'));
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    actor.send({ type: 'dataReady' });
    const asking = await waitFor(actor, (s) => s.matches('recovering'));
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    const prompt = asking.children.recovery;
    prompt?.send({ type: 'save' });
    await waitFor(prompt ?? actor, () => prompt?.getSnapshot().value === 'saveFailed');
    expect(actor.getSnapshot().matches('recovering')).toBe(true);
    prompt?.send({ type: 'discard' });

    await waitFor(actor, (s) => s.matches('ready'));
    expect(discarded).toEqual(['left']);
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    actor.stop();
  });

  it('shows sign-in on the first launch, asks about sharing, and starts the app', async () => {
    let seeded = false;
    const seed = fromPromise(async () => {
      seeded = true;
    });
    // Google and the server say yes, for the account already kept (nothing to replace).
    const me: Account = { id: 'me', name: 'Me', image: null };
    const signIn = signInMachine.provide({
      actors: {
        signingIn: fromPromise(
          async (): Promise<{ account: Account; replacing: string | null } | 'cancelled'> => ({
            account: me,
            replacing: null,
          }),
        ),
        keeping: fromPromise<void, Account | null>(async () => {}),
      },
    });
    const actor = createActor(
      startup.provide({
        actors: {
          migrate: fine,
          seed,
          check: nothingOpen,
          identify: fromPromise(async (): Promise<'signIn' | 'ask' | 'go'> => 'signIn'),
          signIn,
          // A new account: the server has no answer, so it's asked.
          consent: consentMachine.provide({
            actors: {
              reading: fromPromise(async (): Promise<'answered' | 'ask'> => 'ask'),
              notNow: fine,
            },
          }),
        },
      }),
    ).start();

    const asking = await waitFor(actor, (s) => s.matches('signingIn'));
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
    expect(seeded).toBe(false);
    asking.children.signIn?.send({ type: 'press' });

    const question = await waitFor(actor, (s) => s.matches('consenting'));
    expect(seeded).toBe(false);
    question.children.consent?.send({ type: 'notNow' });

    await waitFor(actor, (s) => s.matches('reading'));
    expect(seeded).toBe(true);
    actor.send({ type: 'dataReady' });
    expect(actor.getSnapshot().matches('ready')).toBe(true);
    actor.stop();
  });

  it('stays up when the session check fails, as it does offline', async () => {
    const actor = createActor(
      startup.provide({
        actors: {
          migrate: fine,
          seed: fine,
          check: nothingOpen,
          session: fromPromise(async (): Promise<'ok' | 'gone' | 'unknown'> => {
            throw new Error('fetch failed: Unable to resolve host');
          }),
        },
      }),
    ).start();
    await waitFor(actor, (s) => s.matches('reading'));
    actor.send({ type: 'dataReady' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().status).toBe('active');
    expect(actor.getSnapshot().matches('ready')).toBe(true);
    actor.stop();
  });

  it('goes back to sign-in when you sign out on Me', async () => {
    const actor = createActor(
      startup.provide({
        actors: { migrate: fine, seed: fine, check: nothingOpen, signOut: fine },
      }),
    ).start();
    await waitFor(actor, (s) => s.matches('reading'));
    actor.send({ type: 'dataReady' });
    actor.send({ type: 'signOut' });
    await waitFor(actor, (s) => s.matches('signingIn'));
    expect(actor.getSnapshot().children.signIn).toBeDefined();
    actor.stop();
  });

  it('clears the phone after the server deleted the account, then shows sign-in', async () => {
    let cleared = false;
    const forget = fromPromise(async () => {
      cleared = true;
    });
    const actor = createActor(
      startup.provide({ actors: { migrate: fine, seed: fine, check: nothingOpen, forget } }),
    ).start();
    await waitFor(actor, (s) => s.matches('reading'));
    actor.send({ type: 'dataReady' });
    actor.send({ type: 'deleted' });
    const signingIn = await waitFor(actor, (s) => s.matches('signingIn'));
    expect(cleared).toBe(true);
    // The sign-in screen ends the old session with Google first.
    expect(signingIn.context.leaving).toBe(true);
    actor.stop();
  });

  it('asks a phone signed in before about sharing, once the splash is gone', async () => {
    const actor = createActor(
      startup.provide({
        actors: {
          migrate: fine,
          seed: fine,
          check: nothingOpen,
          identify: fromPromise(async (): Promise<'signIn' | 'ask' | 'go'> => 'ask'),
          consent: consentMachine.provide({
            actors: { reading: fromPromise(async (): Promise<'answered' | 'ask'> => 'ask') },
          }),
        },
      }),
    ).start();
    const asking = await waitFor(actor, (s) => s.matches('consenting'));
    expect(SplashScreen.hide).toHaveBeenCalled();
    expect(asking.children.consent).toBeDefined();
    actor.stop();
  });

  it('brings back what the server holds before Home, and keeps videos without a set until it has', async () => {
    const launch = () =>
      createActor(startup.provide({ actors: { migrate: fine, seed: fine } })).start();
    // Signed in again: Home waits for the pull.
    synced.restored.mockReturnValue(false);
    let pulled = () => {};
    synced.sync.mockReturnValue(new Promise<void>((resolve) => (pulled = resolve)));
    const first = launch();
    await waitFor(first, (s) => s.matches('restoring'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(first.getSnapshot().matches('restoring')).toBe(true);
    pulled();
    await waitFor(first, (s) => s.matches('reading'));
    first.stop();

    // Offline: Home opens anyway, and the videos stay for the pull to come.
    synced.sync.mockRejectedValue(new Error('Network request failed'));
    const offline = launch();
    await waitFor(offline, (s) => s.matches('reading'));
    offline.stop();
    expect(videos.deleteOrphans).not.toHaveBeenCalled();

    // A later launch after the pull: no wait before Home, and the cleanup runs.
    synced.restored.mockReturnValue(true);
    const later = launch();
    await waitFor(later, (s) => s.matches('reading'));
    later.stop();
    expect(synced.sync).toHaveBeenCalledTimes(2);
    expect(videos.deleteOrphans).toHaveBeenCalledTimes(1);
  });
});
