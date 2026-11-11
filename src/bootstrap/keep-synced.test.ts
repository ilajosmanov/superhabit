import { createActor, fromCallback, fromPromise, SimulatedClock } from 'xstate';
import { describe, expect, it, vi } from 'vite-plus/test';

import { keepSynced } from './keep-synced';
import { SessionGone } from '@/account/server';

// The phone's listeners and the rounds themselves are faked; the timing is the machine's, on a simulated clock.
vi.mock('expo-network', () => ({}));
vi.mock('expo-sqlite', () => ({}));
vi.mock('react-native', () => ({}));
vi.mock('@/account/sync', () => ({}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Starts it; each round takes the next outcome (by default it works). `rounds`: whether each pulled. */
function start(...outcomes: ('ok' | 'offline' | 'gone' | 'held' | 'heldOffline')[]) {
  const clock = new SimulatedClock();
  const rounds: boolean[] = [];
  const held: (() => void)[] = [];
  let tell = (_pull: boolean) => {};
  const actor = createActor(
    keepSynced.provide({
      actors: {
        listen: fromCallback(({ sendBack }) => {
          tell = (pull) => sendBack({ type: 'kick', pull });
        }),
        round: fromPromise<void, boolean>(async ({ input }) => {
          rounds.push(input);
          const outcome = outcomes.shift() ?? 'ok';
          if (outcome === 'offline') throw new TypeError('Network request failed');
          if (outcome === 'gone') throw new SessionGone();
          if (outcome === 'held' || outcome === 'heldOffline')
            await new Promise<void>((resolve) => held.push(resolve));
          if (outcome === 'heldOffline') throw new TypeError('Network request failed');
        }),
      },
    }),
    { clock },
  ).start();
  const wait = async (ms: number) => {
    clock.increment(ms);
    await settle();
  };
  return { actor, rounds, held, wait, kick: (pull: boolean) => tell(pull) };
}

describe('keeping the account synced', () => {
  it('offline, tries again slower each time, and at once when you do something', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rounds, wait, kick } = start('offline', 'offline', 'ok');
    await settle();
    expect(rounds).toEqual([true]);
    await wait(4_999);
    expect(rounds).toHaveLength(1);
    await wait(1);
    expect(rounds).toEqual([true, true]);
    // The second wait is longer, but a workout's Done goes a second later; the pull it missed comes too.
    await wait(9_000);
    expect(rounds).toHaveLength(2);
    kick(false);
    await wait(1_000);
    expect(rounds).toEqual([true, true, true]);
    await wait(10 * 60_000);
    expect(rounds).toHaveLength(3);
  });

  it('sends what was queued while a round ran, in one more round however many changes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rounds, held, wait, kick } = start('held', 'ok', 'held', 'ok');
    await settle();
    kick(false);
    kick(false);
    held[0]?.();
    await settle();
    await wait(999);
    expect(rounds).toHaveLength(1);
    await wait(1);
    expect(rounds).toEqual([true, false]);
    await wait(10 * 60_000);
    expect(rounds).toHaveLength(2);

    // A burst of changes from rest makes one round a second after the last.
    kick(false);
    await wait(600);
    kick(true);
    await wait(999);
    expect(rounds).toHaveLength(2);
    await wait(1);
    expect(rounds).toEqual([true, false, true]);
  });

  it('a change made during a round that fails is tried again in a second, not after the backoff', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rounds, held, wait, kick } = start('heldOffline');
    await settle();
    kick(false);
    held[0]?.();
    await settle();
    await wait(1_000);
    // The failed round's pull comes along.
    expect(rounds).toEqual([true, true]);
  });

  it('stops when the server ended the session, until the next sign-in starts it', async () => {
    const { actor, rounds, wait, kick } = start('gone');
    await settle();
    expect(actor.getSnapshot().status).toBe('done');
    kick(true);
    await wait(10 * 60_000);
    expect(rounds).toHaveLength(1);
  });
});
