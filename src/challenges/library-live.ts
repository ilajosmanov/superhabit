import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import type { Library } from './library-view';
import { challengeRows, runRows, versionRows } from './library';
import { setRows, workoutRows } from '@/workout/store';

// shortcut: whole tables, read again on every change to one; fine for a phone's worth of challenges and
// workouts. Filter by day or run once history makes them long.
/**
 * The library's tables, kept current: each query is one table, because a live query re-runs only when its
 * own table changes (a `with` table's change would be missed). `loading` until every table first reads.
 */
export function useLibrary(): Library & { loading: boolean } {
  const queries = [
    useLiveQuery(challengeRows()),
    useLiveQuery(versionRows()),
    useLiveQuery(runRows()),
    useLiveQuery(workoutRows()),
    useLiveQuery(setRows()),
  ] as const;
  const [challenges, versions, runs, workouts, sets] = queries;
  return {
    challenges: challenges.data,
    versions: versions.data,
    runs: runs.data,
    workouts: workouts.data,
    sets: sets.data,
    loading: queries.some(({ updatedAt }) => !updatedAt),
  };
}
