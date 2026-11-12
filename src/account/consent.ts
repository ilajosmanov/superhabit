import { assign, fromPromise, setup } from 'xstate';

import { call, thrown, whyCallFailed, type CallFailure } from './call';
import { oneAtATime } from './one-at-a-time';
import { dropWithdrawal, keepGrant, keepSharing, keepWithdrawal, withdrawalQueued } from './store';
import { account } from '@/storage/account';
import { sharing, type Sharing } from '@/storage/consent';

/** The privacy policy the consent was given under; a new one is asked again. */
export const POLICY_VERSION = '2026-11-12';

/** This phone has your answer for the current policy. */
export const answered = () => sharing()?.policyVersion === POLICY_VERSION;

/** Whether this answer (as kept, or the shared snapshot's) shares now: a yes under an older policy doesn't. */
export const shares = (answer: Sharing | null) =>
  answer?.policyVersion === POLICY_VERSION && answer.traces;

/** Whether you share now. */
export const sharingNow = () => shares(sharing());

const keep = (traces: boolean) => keepSharing({ traces, policyVersion: POLICY_VERSION });

/** Whether the account shares its traces, as the server has it (any phone it was given on). */
async function givenBefore() {
  // Asked before the consent screen shows: 5 s, not the client's 20.
  const data = await call<{ consents: { kind: string; policyVersion: string }[] }>('/me', {
    timeout: 5_000,
  });
  if (!data) throw new Error('/me: no answer');
  return data.consents.some((c) => c.kind === 'traces' && c.policyVersion === POLICY_VERSION);
}

const tell = (granted: boolean) =>
  call('/consent', {
    method: 'PUT',
    body: { kind: 'traces', policyVersion: POLICY_VERSION, granted },
  });

// One consent call at a time: a withdrawal sent again while a yes is on its way would undo the yes.
const inTurn = oneAtATime();

/**
 * Gives sharing on the server, which keeps the proof, then keeps the yes here; throws when the server
 * didn't take it. Withdrawing stops at once on this phone, online or not: a server that can't be told is
 * told later (`tellWithdrawal`).
 */
export const setSharing = (granted: boolean) =>
  inTurn(async () => {
    if (granted) {
      const owner = account()?.id;
      await tell(true);
      // Another account signed in meanwhile: this yes isn't theirs.
      if (account()?.id !== owner) return;
      keepGrant(POLICY_VERSION);
      return;
    }
    // Told now if the server answers.
    keepWithdrawal(POLICY_VERSION);
    await withdraw().catch((error: unknown) => console.warn('[consent] withdrawal queued', error));
  });

/** Tells the server a withdrawal it hasn't heard yet, if there is one; throws when it can't. */
async function withdraw() {
  const owner = account()?.id;
  if (!withdrawalQueued()) return;
  await tell(false);
  if (account()?.id === owner) dropWithdrawal();
}

/**
 * The server answered that sharing is off (withdrawn on another phone): this phone stops too, once `/me`
 * agrees, in turn with `setSharing`, so a yes on its way isn't undone. Nothing is queued: the server has it.
 */
export const heardOff = () =>
  inTurn(async () => {
    const owner = account()?.id;
    if (await givenBefore()) return;
    if (account()?.id === owner && sharingNow()) keep(false);
  });

/** Sync's turn: a withdrawal made offline reaches the server; throws when it can't. */
export const tellWithdrawal = () => inTurn(withdraw);

const reading = fromPromise(async (): Promise<'answered' | 'ask'> => {
  if (answered()) return 'answered';
  // Unreadable is asked: a yes the server already has changes nothing there.
  if (!(await givenBefore().catch(() => false))) return 'ask';
  keep(true);
  return 'answered';
});
const saving = fromPromise(async () => setSharing(true));
// shortcut: after a new policy, a yes under the old one stays on the server with the traces it shared
// (nothing new goes up: uploads need the current policy's yes). Decide whether Not now withdraws it before
// `POLICY_VERSION` first changes for real users.
const notNow = fromPromise(async () => keep(false));

/**
 * The one question: share your traces to train the counter? Asked right after sign-in, or at launch on a
 * phone without an answer for the current policy (a new policy asks again). Not when this phone has the
 * answer (the same account signing in again), nor when the server says it was given, on any phone. Yes needs the server; Not now only keeps the answer here. Profile changes it later.
 */
// Positional generics (no type assertions allowed): context, events, actors.
export const consent = setup<
  { error: CallFailure | null },
  { type: 'agree' } | { type: 'notNow' },
  {
    reading: typeof reading;
    saving: typeof saving;
    notNow: typeof notNow;
    whyCallFailed: typeof whyCallFailed;
  }
>({ actors: { reading, saving, notNow, whyCallFailed } }).createMachine({
  context: { error: null },
  initial: 'reading',
  states: {
    reading: {
      invoke: {
        src: 'reading',
        onDone: [
          { guard: ({ event }) => event.output === 'answered', target: 'done' },
          { target: 'asking' },
        ],
        // The phone's database failed: not asked now, the switch in Profile still works.
        onError: 'done',
      },
    },
    asking: {
      on: {
        agree: { target: 'saving', actions: assign({ error: null }) },
        notNow: 'declining',
      },
    },
    saving: {
      invoke: {
        src: 'saving',
        onDone: 'done',
        onError: {
          target: 'failing',
          actions: ({ event }) => console.warn('[consent]', event.error),
        },
      },
    },
    failing: {
      invoke: {
        src: 'whyCallFailed',
        input: thrown,
        onDone: { target: 'asking', actions: assign({ error: ({ event }) => event.output }) },
        onError: { target: 'asking', actions: assign({ error: 'failed' }) },
      },
    },
    // Not kept (the database failed): Me's switch still shows off.
    declining: { invoke: { src: 'notNow', onDone: 'done', onError: 'done' } },
    done: { type: 'final' },
  },
});
