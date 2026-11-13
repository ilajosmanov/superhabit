import { aliveDays, FREEZES, streak } from './streak';
import { db } from '@/storage/database';
import { enqueue } from '@/storage/outbox';
import { streakEvents } from '@/storage/schema';
import type { Day } from '@/lib/day';
import { findOpenWorkout, setRows, workoutRows } from '@/workout/store';
import { challengeRows, versionRows, runRows } from '@/challenges/library';
import { readSets } from '@/workout/plan/logged-set';
import { restDays } from '@/challenges/rest-days';

/**
 * Writes the freezes the rules gave days already over, each new one with its outbox row. Run at launch and
 * at each new day; a second run adds nothing, and an event another phone wrote for the same day is the same row.
 * Waits while a workout is open: one started at 23:58 may still make yesterday alive. Writes nothing while
 * freezes are off.
 */
export function keepFreezes(today: Day, freezes = FREEZES) {
  if (!freezes || findOpenWorkout()) return;
  const library = {
    challenges: challengeRows().sync(),
    versions: versionRows().sync(),
    runs: runRows().sync(),
    workouts: workoutRows().sync(),
    sets: readSets(setRows().sync()),
  };
  const { events } = streak(
    aliveDays(library.workouts, library.sets),
    today,
    freezes,
    restDays(library, today),
  );
  if (events.length === 0) return;
  const createdAt = Date.now();
  db().transaction((tx) => {
    const added = tx
      .insert(streakEvents)
      .values(events.map((event) => ({ ...event, createdAt })))
      .onConflictDoNothing({ target: streakEvents.id })
      .returning()
      .all();
    for (const event of added)
      enqueue(tx, { entity: 'streak_event', entityId: event.id, op: 'add', data: { event } });
  });
}
