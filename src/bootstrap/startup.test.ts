import { createActor, fromPromise, waitFor } from 'xstate';
import { describe, expect, it, vi } from 'vite-plus/test';
import * as SplashScreen from 'expo-splash-screen';

import { startup } from './startup';
import { recovery } from '@/workout/recovery';

vi.mock('@/challenges/library', () => ({}));
vi.mock('@/streak/store', () => ({ keepFreezes: () => {} }));
vi.mock('@/storage/database', () => ({}));
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
});
