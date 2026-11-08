import { uuid } from 'expo';

import { CHALLENGES } from './challenges';
import { doneToday, runOn, today, type Day, type Run } from './days';
import { parse, serialise, type Saved } from './saved';
import { fileStore } from '@/storage/file-store';
import type { Challenge } from '@/workout/plan';

/** Every challenge you joined or made, in the order you added them. */
const store = fileStore<readonly Saved[]>('challenges', { empty: [], parse, serialise });

const runOf = (entry: Saved, day = today()) =>
  runOn(entry.challenge, entry.startedOn, entry.progress, day);

/** A route id's challenge: yours first (an edited suggestion keeps its id), then ours, with its run on `day`. */
export function useChallenge(
  id: string,
  day = today(),
): { challenge: Challenge; saved?: Saved; run: Run | null } | null {
  const mine = store.use().find((entry) => entry.id === id);
  if (mine) return { challenge: mine.challenge, saved: mine, run: runOf(mine, day) };
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
  put({ id, challenge, startedOn: today(), progress: {}, sets: {} });

/** Join a challenge you made; its new id, or null when it couldn't be saved. */
export function create(challenge: Challenge) {
  const id = uuid.v4();
  return join(id, challenge) ? id : null;
}

/**
 * New numbers for a challenge you are in; its run and day shares stay. What each set got goes once the
 * session changes: those numbers belonged to the old sets and goals.
 */
export function update(id: string, challenge: Challenge) {
  const entry = store.get().find((old) => old.id === id);
  if (!entry) return false;
  const same = JSON.stringify(entry.challenge.session) === JSON.stringify(challenge.session);
  return put({ ...entry, challenge, sets: same ? entry.sets : {} });
}

export const leave = (id: string) => store.set(store.get().filter((entry) => entry.id !== id));

const sum = (ns: readonly number[] = []) => ns.reduce((total, n) => total + n, 0);

/**
 * A session's share of the day (0 to 1) and what each set got. The day keeps its best session: the bigger
 * share, or on a tie the one that did more (a MAX goal counts in full at any amount).
 */
export function recordTry(id: string, day: Day, share: number, sets: readonly number[]) {
  const entry = store.get().find((old) => old.id === id);
  const best = entry?.progress[day] ?? 0;
  if (!entry || share < best || (share === best && sum(sets) <= sum(entry.sets[day]))) return true;
  return put({
    ...entry,
    progress: { ...entry.progress, [day]: share },
    sets: { ...entry.sets, [day]: sets },
  });
}
