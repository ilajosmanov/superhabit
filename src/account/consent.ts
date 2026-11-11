import { getNetworkStateAsync } from 'expo-network';
import { and, eq } from 'drizzle-orm';
import { assign, fromPromise, setup } from 'xstate';

import { authClient } from './auth-client';
import { SERVER_URL, SessionGone } from './server';
import { oneAtATime } from '@/lib/one-at-a-time';
import { account } from '@/storage/account';
import { sharing, writeSharing } from '@/storage/consent';
import { db } from '@/storage/database';
import { enqueue } from '@/storage/outbox';
import { outbox } from '@/storage/schema';

/** The privacy policy the consent was given under; a new one is asked again. */
export const POLICY_VERSION = '2026-11-11';

export type ConsentError = 'offline' | 'failed' | null;

/** This phone has your answer for the current policy. */
export const answered = () => sharing()?.policyVersion === POLICY_VERSION;

/** Whether you share now: a yes under an older policy doesn't count. */
export const sharingNow = () => answered() && sharing()?.traces === true;

const keep = (traces: boolean) =>
  db().transaction((tx) => writeSharing(tx, { traces, policyVersion: POLICY_VERSION }));

/** A withdrawal the server hasn't heard yet. */
const queued = and(eq(outbox.entity, 'consent'), eq(outbox.entityId, 'traces'));

/** Whether the account shares its traces, as the server has it (any phone it was given on). */
async function givenBefore() {
  const { data, error } = await authClient.$fetch<{
    consents: { kind: string; policyVersion: string }[];
  }>(`${SERVER_URL}/me`, { timeout: 5_000 });
  if (error || !data) throw new Error(error?.message ?? 'no answer');
  return data.consents.some((c) => c.kind === 'traces' && c.policyVersion === POLICY_VERSION);
}

async function tell(granted: boolean) {
  const { error } = await authClient.$fetch(`${SERVER_URL}/consent`, {
    method: 'PUT',
    body: { kind: 'traces', policyVersion: POLICY_VERSION, granted },
  });
  if (error?.status === 401) throw new SessionGone();
  if (error) throw new Error(error.message ?? `consent: ${error.status}`);
}

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
      // The yes stands: a withdrawal still queued must not undo it.
      db().transaction((tx) => {
        writeSharing(tx, { traces: true, policyVersion: POLICY_VERSION });
        tx.delete(outbox).where(queued).run();
      });
      return;
    }
    // The no and its withdrawal for the server, kept or lost together; told now if the server answers.
    db().transaction((tx) => {
      writeSharing(tx, { traces: false, policyVersion: POLICY_VERSION });
      enqueue(tx, {
        entity: 'consent',
        entityId: 'traces',
        op: 'withdraw',
        data: { policyVersion: POLICY_VERSION },
      });
    });
    await withdraw().catch((error: unknown) => console.warn('[consent] withdrawal queued', error));
  });

/** Tells the server a withdrawal it hasn't heard yet, if there is one; throws when it can't. */
async function withdraw() {
  const owner = account()?.id;
  if (!db().select({ id: outbox.id }).from(outbox).where(queued).get()) return;
  await tell(false);
  if (account()?.id === owner) db().delete(outbox).where(queued).run();
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

/** Why a call to the server failed: no internet, or anything else. */
export const whyFailed = fromPromise(async (): Promise<ConsentError> =>
  (await getNetworkStateAsync()).isInternetReachable === false ? 'offline' : 'failed',
);

const reading = fromPromise(async (): Promise<'answered' | 'ask'> => {
  if (answered()) return 'answered';
  // Unreadable is asked: a yes the server already has changes nothing there.
  if (!(await givenBefore().catch(() => false))) return 'ask';
  keep(true);
  return 'answered';
});
const saving = fromPromise(async () => setSharing(true));
// shortcut: after a new policy, a yes under the old one stays on the server; piece 6 uploads only under
// the current policy's grant.
const notNow = fromPromise(async () => keep(false));

/**
 * The one question: share your traces to train the counter? Asked right after sign-in, or at launch on a
 * phone without an answer for the current policy (a new policy asks again). Not when this phone has the
 * answer (the same account signing in again), nor when the server says it was given, on any phone. Yes needs the server; Not now only keeps the answer here. Profile changes it later.
 */
// Positional generics (no type assertions allowed): context, events, actors.
export const consent = setup<
  { error: ConsentError },
  { type: 'agree' } | { type: 'notNow' },
  {
    reading: typeof reading;
    saving: typeof saving;
    notNow: typeof notNow;
    whyFailed: typeof whyFailed;
  }
>({ actors: { reading, saving, notNow, whyFailed } }).createMachine({
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
        src: 'whyFailed',
        onDone: { target: 'asking', actions: assign({ error: ({ event }) => event.output }) },
        onError: { target: 'asking', actions: assign({ error: 'failed' }) },
      },
    },
    // Not kept (the database failed): Me's switch still shows off.
    declining: { invoke: { src: 'notNow', onDone: 'done', onError: 'done' } },
    done: { type: 'final' },
  },
});
