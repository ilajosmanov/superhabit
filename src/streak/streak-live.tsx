import { createContext, use, type ReactNode } from 'react';

import { useLibrary } from '@/challenges/library-live';
import { restDays } from '@/challenges/rest-days';
import { useToday } from '@/components/today';
import { aliveDays, streak, type Streak } from './streak';

const Shared = createContext<Streak | null>(null);

/** Derive one personal streak per library snapshot and day, shared by Home and League. */
export function StreakProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const today = useToday();
  const current = streak(
    aliveDays(library.workouts, library.sets),
    today,
    undefined,
    restDays(library, today),
  );
  return <Shared value={current}>{children}</Shared>;
}

export function useStreak(): Streak {
  const current = use(Shared);
  if (!current) throw new Error('useStreak needs StreakProvider above it');
  return current;
}
