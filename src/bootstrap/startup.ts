import * as SplashScreen from 'expo-splash-screen';
import { assign, fromPromise, setup, type PromiseActorLogic } from 'xstate';

import { dayClock, type DayEvent } from './day';
import { seed } from '@/challenges/library';
import { migrateDatabase } from '@/storage/database';
import { today, type Day } from '@/workout/day';
import { findOpenWorkout, recovery } from '@/workout/recovery';
import { deleteOrphanVideos } from '@/workout/video-file';

type Context = {
  error: string;
  /** Today, turned at midnight and read again when the app returns (`dayClock`). */
  today: Day;
  /** The workout a session left open, offered back before anything else shows. */
  open: { id: string } | null;
};

/**
 * Gets the phone ready before any screen reads it: opens the database, brings its tables up to date,
 * adds our challenges, and offers back a workout left open. The splash stays up until there is something
 * to show; `error` stays set while a Retry runs. Each step lives with its owner; this only orders them.
 * It also keeps today for the screens (`dayClock`), from launch on.
 *
 *   migrating --> seeding --> checking --> ready
 *       ^    \--------\----------\--> failed (shows the error) --retry
 *                                 \--> recovering (Save / Discard) --> ready
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions.
export const startup = setup<
  Context,
  { type: 'retry' } | DayEvent,
  {
    migrate: PromiseActorLogic<void>;
    seed: PromiseActorLogic<void>;
    check: PromiseActorLogic<{ id: string } | null>;
    recovery: typeof recovery;
    dayClock: typeof dayClock;
  },
  { recovery: 'recovery' },
  { hideSplash: undefined; fail: undefined }
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
    hideSplash: () => SplashScreen.hide(),
    fail: assign({ error: ({ event }) => ('error' in event ? String(event.error) : '') }),
  },
}).createMachine({
  context: { error: '', today: today(), open: null },
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
        onDone: [
          {
            guard: ({ event }) => event.output !== null,
            target: 'recovering',
            actions: assign({ open: ({ event }) => event.output }),
          },
          { target: 'ready' },
        ],
        onError: { target: 'failed', actions: 'fail' },
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
    ready: { entry: 'hideSplash' },
    failed: { entry: 'hideSplash', on: { retry: 'migrating' } },
  },
});
