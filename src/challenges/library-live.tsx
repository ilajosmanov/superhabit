import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, use, type ReactNode } from 'react';
import { View } from 'react-native';

import type { Library } from './library-view';
import { challengeRows, runRows, versionRows } from './library';
import { accountRows, readAccount } from '@/storage/account';
import { setRows, workoutRows } from '@/workout/store';

const Shared = createContext<Library | null>(null);

// shortcut: whole tables, read again on every change to one, and once per changed row (SQLite's update
// hook fires per row, so a Discard re-reads `sets` once per set); fine for a phone's worth of challenges
// and workouts. Filter by day or run, and read a table once per burst, once history makes them long.
/**
 * The library's tables, read once for the whole app and kept current, so a page pushed later has them on
 * its first frame instead of sliding in empty while it reads. Each query is one table, because a live
 * query re-runs only when its own table changes (a `with` table's change would be missed).
 */
export function LibraryProvider({
  children,
  onRead,
}: {
  children: ReactNode;
  /** The first read is done and the screens under it are laid out, or (with `error`) it failed. */
  onRead: (error?: string) => void;
}) {
  const queries = [
    useLiveQuery(challengeRows()),
    useLiveQuery(versionRows()),
    useLiveQuery(runRows()),
    useLiveQuery(workoutRows()),
    useLiveQuery(setRows()),
    useLiveQuery(accountRows()),
  ] as const;
  const [challenges, versions, runs, workouts, sets, accounts] = queries;
  // A first read that failed goes to startup's error and Retry; a later one keeps the last tables.
  const failed = queries.find(({ error, updatedAt }) => error && !updatedAt);
  if (failed) return <View className="flex-1" onLayout={() => onRead(String(failed.error))} />;
  if (queries.some(({ updatedAt }) => !updatedAt)) return null;
  // Startup signed you in before mounting this, so the row is there.
  const [kept] = accounts.data;
  if (!kept) return null;
  const library = {
    you: readAccount(kept.value).id,
    challenges: challenges.data,
    versions: versions.data,
    runs: runs.data,
    workouts: workouts.data,
    sets: sets.data,
  };
  return (
    <Shared value={library}>
      {/* Laid out once the screens under it have committed (Expo's way to hide the splash); a later
          layout tells startup again, which it ignores once ready. */}
      <View className="flex-1" onLayout={() => onRead()}>
        {children}
      </View>
    </Shared>
  );
}

/** The complete shared snapshot, available synchronously on every screen's first render. */
export function useLibrary(): Library {
  const library = use(Shared);
  if (!library) throw new Error('useLibrary needs LibraryProvider above it');
  return library;
}
