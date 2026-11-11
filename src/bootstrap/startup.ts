import * as SplashScreen from 'expo-splash-screen';
import { assign, enqueueActions, fromPromise, setup, type PromiseActorLogic } from 'xstate';

import { dayClock, type DayEvent } from './day';
import { answered, consent } from '@/account/consent';
import { checkSession, signOut } from '@/account/session';
import { dropPreAccountFiles, forgetAccount, markSignedOut } from '@/account/store';
import { signIn } from '@/account/sign-in';
import { seed } from '@/challenges/library';
import { account } from '@/storage/account';
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
  /** Sign-in follows Me's Sign out or Delete account: the old session ends first. */
  leaving: boolean;
};

/**
 * Gets the phone ready before any screen reads it: opens the database, brings its tables up to date, has
 * you signed in (once; the account is kept, so later launches go on offline), adds our challenges, and
 * offers back a workout left open. Right after sign-in, or at launch while this phone has no answer for
 * the current privacy policy, it asks whether you share your traces (`consent`). Once ready it checks the session with the server (`checkSession`); one the server
 * ended is asked for again at the next launch, never mid-use, where it would drop a workout. Sign out (on
 * Me) goes back to signing in; so does Delete account, once the phone is cleared. The splash stays up
 * until there is something to show; `error` stays set while a Retry runs. Each step lives with its owner; this only orders them.
 * It also keeps today for the screens (`dayClock`), from launch on, and once ready writes the freezes of
 * days that are over, at launch and at each new day.
 *
 *   migrating --> identifying --> (consenting) --> seeding --> checking --> reading --> ready
 *       ^    \           \--> signingIn --> consenting --^       \--> recovering (Save / Discard) --> ready
 *       |     \--------------\----------\----------\--> failed (shows the error) --retry
 *   ready --signOut--> signingOut --> signingIn
 *   ready --deleted--> forgetting --> signingIn
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions.
export const startup = setup<
  Context,
  | { type: 'retry' }
  | { type: 'dataReady'; error?: string }
  | { type: 'signOut' }
  | { type: 'deleted' }
  | DayEvent,
  {
    migrate: PromiseActorLogic<void>;
    identify: PromiseActorLogic<'signIn' | 'ask' | 'go'>;
    signIn: typeof signIn;
    consent: typeof consent;
    session: typeof checkSession;
    signOut: typeof signOut;
    forget: PromiseActorLogic<void>;
    seed: PromiseActorLogic<void>;
    check: PromiseActorLogic<{ id: string } | null>;
    recovery: typeof recovery;
    dayClock: typeof dayClock;
  },
  { recovery: 'recovery'; signIn: 'signIn'; consent: 'consent' },
  { hideSplash: undefined; fail: undefined; keepFreezes: undefined }
>({
  actors: {
    migrate: fromPromise(() => migrateDatabase()),
    // Signed in: an account is kept and the server hasn't ended its session. Then: is there a question?
    identify: fromPromise(async () => {
      const kept = account();
      if (!kept || kept.signedOut) return 'signIn';
      return answered() ? 'go' : 'ask';
    }),
    signIn,
    consent,
    session: checkSession,
    signOut,
    forget: fromPromise(async () => forgetAccount()),
    seed: fromPromise(async () => seed()),
    check: fromPromise(async () => {
      deleteOrphanVideos();
      try {
        dropPreAccountFiles();
      } catch (error) {
        // Nothing depends on it: the next launch tries again.
        console.warn('[account] could not delete the files from before accounts', error);
      }
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
  context: { error: '', today: today(), open: null, splashHidden: false, leaving: false },
  invoke: { src: 'dayClock' },
  on: { day: { actions: assign({ today: ({ event }) => event.day }) } },
  initial: 'migrating',
  states: {
    migrating: {
      invoke: {
        src: 'migrate',
        onDone: 'identifying',
        onError: { target: 'failed', actions: 'fail' },
      },
    },
    identifying: {
      invoke: {
        src: 'identify',
        onDone: [
          { guard: ({ event }) => event.output === 'go', target: 'seeding' },
          { guard: ({ event }) => event.output === 'ask', target: 'consenting' },
          { target: 'signingIn' },
        ],
        onError: { target: 'failed', actions: 'fail' },
      },
    },
    // The root shows the sign-in screen over nothing else; the account is kept when it's done.
    signingIn: {
      // A Retry that got here leaves no error over the screen.
      entry: ['hideSplash', assign({ error: '' })],
      invoke: {
        src: 'signIn',
        id: 'signIn',
        input: ({ context }) => ({ leaving: context.leaving }),
        onDone: { target: 'consenting', actions: assign({ leaving: false }) },
      },
    },
    // The root shows the consent screen with the machine's child, when there is a question to ask.
    consenting: {
      entry: 'hideSplash',
      invoke: { src: 'consent', id: 'consent', onDone: 'seeding' },
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
      // Nothing the check meets may take the app down: offline, it just didn't happen.
      invoke: {
        src: 'session',
        onError: {
          actions: ({ event }) => console.warn('[account] session check failed', event.error),
        },
      },
      on: {
        day: { actions: [assign({ today: ({ event }) => event.day }), 'keepFreezes'] },
        signOut: 'signingOut',
        deleted: 'forgetting',
      },
    },
    // Me's Sign out: the screens go, the sign-in screen comes.
    signingOut: {
      invoke: {
        src: 'signOut',
        onDone: { target: 'signingIn', actions: assign({ leaving: true }) },
        // The account row couldn't be written: you stay signed in.
        onError: {
          target: 'ready',
          actions: ({ event }) => console.warn('[account] sign-out failed', event.error),
        },
      },
    },
    // The server deleted the account (Me): the screens go, then the phone is cleared and the sign-in screen
    // ends the session with Google (`leaving`). Data left behind is asked about at the next sign-in.
    forgetting: {
      invoke: {
        src: 'forget',
        onDone: { target: 'signingIn', actions: assign({ leaving: true }) },
        // Never back in as the deleted account: it's marked signed out, if even that can be written.
        // shortcut: a folder that couldn't be deleted stays once another account signs in; sweep folders of
        // deleted accounts if this is ever seen in logs.
        onError: {
          target: 'signingIn',
          actions: [
            assign({ leaving: true }),
            ({ event }) => {
              console.warn('[account] could not clear the phone', event.error);
              try {
                markSignedOut();
              } catch (error) {
                console.warn('[account] could not mark it signed out', error);
              }
            },
          ],
        },
      },
    },
    failed: { entry: 'hideSplash', on: { retry: 'migrating' } },
  },
});
