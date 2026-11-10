import * as SplashScreen from 'expo-splash-screen';
import { assign, enqueueActions, fromPromise, setup, type PromiseActorLogic } from 'xstate';

import { dayClock, type DayEvent } from './day';
import { seed } from '@/challenges/library';
import { migrateDatabase } from '@/storage/database';
import { keepFreezes } from '@/streak/store';
import { today, type Day } from '@/workout/plan/day';
import { recovery } from '@/workout/recovery';
import { deleteOrphanVideos, findOpenWorkout } from '@/workout/store';

type Context = {
  error: string;
  /** Today, turned at midnight and read again when the app returns (`dayClock`). */
  today: Day;
  /** The workout a session left open, offered back before anything else shows. */
  open: { id: string } | null;
  /** A failure/retry or recovery must never hide the native splash a second time. */
  splashHidden: boolean;
};

/**
 * Gets the phone ready before any screen reads it: opens the database, brings its tables up to date,
 * adds our challenges, and offers back a workout left open. The splash stays up until there is something
 * to show; `error` stays set while a Retry runs. Each step lives with its owner; this only orders them.
 * It also keeps today for the screens (`dayClock`), from launch on, and once ready writes the freezes of
 * days that are over, at launch and at each new day.
 *
 *   migrating --> seeding --> checking --> reading --> ready
 *       ^    \--------\----------\--> failed (shows the error) --retry
 *                                           \--> recovering (Save / Discard) --> ready
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions.
export const startup = setup<
  Context,
  { type: 'retry' } | { type: 'dataReady'; error?: string } | DayEvent,
  {
    migrate: PromiseActorLogic<void>;
    seed: PromiseActorLogic<void>;
    check: PromiseActorLogic<{ id: string } | null>;
    recovery: typeof recovery;
    dayClock: typeof dayClock;
  },
  { recovery: 'recovery' },
  { hideSplash: undefined; fail: undefined; keepFreezes: undefined }
>({
  actors: {
    migrate: fromPromise(() => migrateDatabase()),
    seed: fromPromise(async () => seed()),
    check: fromPromise(async () => {
      deleteOrphanVideos();
      return findOpenWorkout();
    }),
    recovery,
    dayClock,
  },
  actions: {
    hideSplash: enqueueActions(({ context, enqueue }) => {
      if (context.splashHidden) return;
      enqueue(() => SplashScreen.hide());
      enqueue.assign({ splashHidden: true });
    }),
    fail: assign({ error: ({ event }) => ('error' in event ? String(event.error) : '') }),
    keepFreezes: ({ context }) => {
      try {
        keepFreezes(context.today);
      } catch (error) {
        // Nothing is lost: the next launch or day writes them.
        console.warn('[streak] could not keep freezes', error);
      }
    },
  },
}).createMachine({
  context: { error: '', today: today(), open: null, splashHidden: false },
  invoke: { src: 'dayClock' },
  on: { day: { actions: assign({ today: ({ event }) => event.day }) } },
  initial: 'migrating',
  states: {
    migrating: {
      invoke: { src: 'migrate', onDone: 'seeding', onError: { target: 'failed', actions: 'fail' } },
    },
    seeding: {
      invoke: { src: 'seed', onDone: 'checking', onError: { target: 'failed', actions: 'fail' } },
    },
    checking: {
      invoke: {
        src: 'check',
        onDone: { target: 'reading', actions: assign({ open: ({ event }) => event.output }) },
        onError: { target: 'failed', actions: 'fail' },
      },
    },
    reading: {
      // The root mounts the shared provider and the screens here, after migration and seeding. Once they
      // are laid out over the first complete read, dataReady hides the splash; a first read that failed
      // shows the error with Retry.
      on: {
        dataReady: [
          { guard: ({ event }) => event.error !== undefined, target: 'failed', actions: 'fail' },
          { guard: ({ context }) => context.open !== null, target: 'recovering' },
          { target: 'ready' },
        ],
      },
    },
    recovering: {
      entry: 'hideSplash',
      invoke: {
        src: 'recovery',
        id: 'recovery',
        input: ({ context }) => ({ id: context.open?.id ?? '' }),
        onDone: 'ready',
      },
    },
    ready: {
      entry: ['hideSplash', 'keepFreezes'],
      on: { day: { actions: [assign({ today: ({ event }) => event.day }), 'keepFreezes'] } },
    },
    failed: { entry: 'hideSplash', on: { retry: 'migrating' } },
  },
});
