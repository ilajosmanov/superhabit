import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/storage/database';

/**
 * A workout an earlier session left open, kept current (Save or Discard clears it); `own`, the workout
 * about to start here, never counts. A new workout can't start while one is left: only one is open.
 */
export function useLeftWorkout(own: string) {
  const { data, updatedAt } = useLiveQuery(
    db().query.workouts.findFirst({ where: { status: 'open' }, columns: { id: true } }),
  );
  return { loading: !updatedAt, workout: data && data.id !== own ? data : null };
}
