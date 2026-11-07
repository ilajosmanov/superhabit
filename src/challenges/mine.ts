import { uuid } from 'expo';

import { CHALLENGES } from './challenges';
import { doneToday, runOn, today, type Day, type Run } from './days';
import { parse, serialise, type Saved } from './saved';
import { fileStore } from '@/storage/file-store';
import type { Challenge } from '@/workout/plan';

/** Every challenge you joined or made, in the order you added them. */
const store = fileStore<readonly Saved[]>('challenges', { empty: [], parse, serialise });

const runOf = (entry: Saved, day = today()) =>
  runOn(entry.challenge, entry.startedOn, entry.done, day);

/** A route id's challenge: yours first (an edited suggestion keeps its id), then ours. `run` is today's. */
export function useChallenge(
  id: string,
): { challenge: Challenge; saved?: Saved; run: Run | null } | null {
  const mine = store.use().find((entry) => entry.id === id);
  if (mine) return { challenge: mine.challenge, saved: mine, run: runOf(mine) };
  const ours = CHALLENGES.get(id);
  return ours ? { challenge: ours, run: null } : null;
}

// shortcut: `day` is read on render, so a screen left open across midnight shows yesterday until something
// re-renders it; drive it from an actor ticking at midnight and on foregrounding if that bites.
/** What you are in today, with its run, due first; runs that are over are left out. */
export function useActive() {
  const day = today();
  return store
    .use()
    .flatMap((entry) => {
      const run = runOf(entry, day);
      return run ? [{ ...entry, run }] : [];
    })
    .sort((a, b) => Number(doneToday(a.run)) - Number(doneToday(b.run)));
}

export type Active = ReturnType<typeof useActive>[number];

// Every change below returns false, with nothing changed, when the phone can't write it.

const put = (entry: Saved) => {
  const all = store.get();
  return store.set(
    all.some(({ id }) => id === entry.id)
      ? all.map((old) => (old.id === entry.id ? entry : old))
      : [...all, entry],
  );
};

/** Join from day 1; joining again starts the run over. */
export const join = (id: string, challenge: Challenge) =>
  put({ id, challenge, startedOn: today(), done: [] });

/** Join a challenge you made; its new id, or null when it couldn't be saved. */
export function create(challenge: Challenge) {
  const id = uuid.v4();
  return join(id, challenge) ? id : null;
}

/** New numbers for a challenge you are in; its run and done days stay. */
export function update(id: string, challenge: Challenge) {
  const entry = store.get().find((old) => old.id === id);
  return entry ? put({ ...entry, challenge }) : false;
}

export const leave = (id: string) => store.set(store.get().filter((entry) => entry.id !== id));

export function markDone(id: string, day: Day) {
  const entry = store.get().find((old) => old.id === id);
  if (!entry || entry.done.includes(day)) return true;
  return put({ ...entry, done: [...entry.done, day] });
}
