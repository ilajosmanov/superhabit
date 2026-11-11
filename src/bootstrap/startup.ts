import * as SplashScreen from 'expo-splash-screen';
import { assign, enqueueActions, fromPromise, setup, type PromiseActorLogic } from 'xstate';

import { dayClock, type DayEvent } from './day';
import { keepSynced } from './keep-synced';
import { answered, consent } from '@/account/consent';
import { checkSession, signOut } from '@/account/session';
import { dropPreAccountFiles, forgetAccount, markSignedOut } from '@/account/store';
import { signIn } from '@/account/sign-in';
import { restored, sync } from '@/account/sync';
import { seed } from '@/challenges/library';
import { account } from '@/storage/account';
import { migrateDatabase } from '@/storage/database';
import { keepFreezes } from '@/streak/store';
import { today, type Day } from '@/lib/day';
import { recovery } from '@/workout/recovery';
import { deleteOldVideos, deleteOrphanVideos, findOpenWorkout } from '@/workout/store';

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
  /** Sign-in follows the server ending the session: the sign-in screen says so. */
  ended: boolean;
};

/** How long "Warming up" waits for a first pull before Home opens anyway; the pull goes on behind it. */
const RESTORE_MS = 30_000;

/**
 * Gets the phone ready before any screen reads it: opens the database, brings its tables up to date, has
 * you signed in (once; the account is kept, so later launches go on offline), adds our challenges, and
 * offers back a workout left open. Right after sign-in, or at launch while this phone has no answer for
 * the current privacy policy, it asks whether you share your traces (`consent`). Once ready it checks the session with the server (`checkSession`); one the server
 * ended is asked for again at the next launch, never mid-use, where it would drop a workout. Sign out (on
 * Me) goes back to signing in; so does Delete account, once the phone is cleared. The splash stays up
 * until there is something to show; `error` stays set while a Retry runs. Each step lives with its owner; this only orders them.
 * It also keeps today for the screens (`dayClock`), from launch on, and once ready writes the freezes of
 * days that are over and deletes videos past 30 days, at launch and at each new day. Until a pull has brought back what the server holds
 * (a new phone, or signed in again), `restoring` tries it once before Home, for 30 s at most; once ready,
 * `keepSynced` sends and pulls. A call from Profile or League that finds the session gone marks the account
 * signed out (`account/call.ts`); their Sign in sends `sessionEnded`, which goes to signing in. So does the
 * consent screen's, when its Yes found the session gone.
 *
 *   migrating --> identifying --> (consenting) --> seeding --> restoring --> checking --> reading --> ready
 *       ^    \           \--> signingIn --> consenting --^       \--> recovering (Save / Discard) --> ready
 *       |     \--------------\----------\----------\--> failed (shows the error) --retry
 *   ready --signOut--> signingOut --> signingIn
 *   ready, consenting --sessionEnded--> signingIn
 *   ready --deleted--> forgetting --> signingIn
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions.
export const startup = setup<
  Context,
  | { type: 'retry' }
  | { type: 'dataReady'; error?: string }
  | { type: 'signOut' }
  | { type: 'deleted' }
  | { type: 'sessionEnded' }
  | DayEvent,
  {
    migrate: PromiseActorLogic<void>;
    identify: PromiseActorLogic<'signIn' | 'ended' | 'ask' | 'go'>;
    signIn: typeof signIn;
    consent: typeof consent;
    session: typeof checkSession;
    signOut: typeof signOut;
    forget: PromiseActorLogic<void>;
    seed: PromiseActorLogic<void>;
    restore: PromiseActorLogic<void>;
    check: PromiseActorLogic<{ id: string } | null>;
    recovery: typeof recovery;
    dayClock: typeof dayClock;
    keepSynced: typeof keepSynced;
  },
  { recovery: 'recovery'; signIn: 'signIn'; consent: 'consent' },
  { hideSplash: undefined; fail: undefined; newDay: undefined }
>({
  actors: {
    migrate: fromPromise(() => migrateDatabase()),
    // Signed in: an account is kept and its session wasn't ended. Then: is there a question?
    identify: fromPromise(async () => {
      const kept = account();
      if (!kept) return 'signIn';
      // Only the server ending it is news; your own Sign out isn't.
      if (kept.signedOut) return kept.byYou ? 'signIn' : 'ended';
      return answered() ? 'go' : 'ask';
    }),
    signIn,
    consent,
    session: checkSession,
    signOut,
    forget: fromPromise(async () => forgetAccount()),
    seed: fromPromise(async () => seed()),
    // Offline, the app opens anyway: keepSynced pulls later, and the next launch tries here again.
    restore: fromPromise(async () => {
      if (restored()) return;
      await sync().catch((error: unknown) => console.warn('[sync] restore failed', error));
    }),
    check: fromPromise(async () => {
      // Until then a video without a set may be one whose set a pull is still bringing back.
      if (restored()) deleteOrphanVideos();
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
    keepSynced,
  },
  actions: {
    hideSplash: enqueueActions(({ context, enqueue }) => {
      if (context.splashHidden) return;
      enqueue(() => SplashScreen.hide());
      enqueue.assign({ splashHidden: true });
    }),
    fail: assign({ error: ({ event }) => ('error' in event ? String(event.error) : '') }),
    // At launch and each new day: the freezes of days that are over, and videos past 30 days.
    newDay: ({ context }) => {
      try {
        keepFreezes(context.today);
      } catch (error) {
        // Nothing is lost: the next launch or day writes them.
        console.warn('[streak] could not keep freezes', error);
      }
      try {
        deleteOldVideos(context.today);
      } catch (error) {
        console.warn('[videos] could not delete old videos', error);
      }
    },
  },
}).createMachine({
  context: {
    error: '',
    today: today(),
    open: null,
    splashHidden: false,
    leaving: false,
    ended: false,
  },
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
          {
            guard: ({ event }) => event.output === 'ended',
            target: 'signingIn',
            actions: assign({ ended: true }),
          },
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
        input: ({ context }) => ({ leaving: context.leaving, ended: context.ended }),
        onDone: { target: 'consenting', actions: assign({ leaving: false, ended: false }) },
      },
    },
    // The root shows the consent screen with the machine's child, when there is a question to ask.
    consenting: {
      entry: 'hideSplash',
      invoke: { src: 'consent', id: 'consent', onDone: 'seeding' },
      // Its Yes found the session gone (the account is marked signed out, its data kept): sign in again.
      on: { sessionEnded: { target: 'signingIn', actions: assign({ ended: true }) } },
    },
    seeding: {
      invoke: { src: 'seed', onDone: 'restoring', onError: { target: 'failed', actions: 'fail' } },
    },
    // The root shows the waiting screen from here to Home once the splash is gone (after signing in).
    // A stalled network can't hold it: each call gives up after 20 s, but a pull may be many calls.
    restoring: {
      after: { [RESTORE_MS]: 'checking' },
      invoke: { src: 'restore', onDone: 'checking', onError: 'checking' },
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
      entry: ['hideSplash', 'newDay'],
      // Nothing the check meets may take the app down: offline, it just didn't happen.
      invoke: [
        {
          src: 'session',
          onError: {
            actions: ({ event }) => console.warn('[account] session check failed', event.error),
          },
        },
        { src: 'keepSynced' },
      ],
      on: {
        day: { actions: [assign({ today: ({ event }) => event.day }), 'newDay'] },
        signOut: 'signingOut',
        deleted: 'forgetting',
        // Profile or League found the session gone (the account is marked signed out): sign in again.
        sessionEnded: { target: 'signingIn', actions: assign({ ended: true }) },
      },
    },
    // Profile's Sign out, once it sent what was waiting: the screens go, the database is cleared, the sign-in
    // screen comes.
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
