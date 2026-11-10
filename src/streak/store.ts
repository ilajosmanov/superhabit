import { aliveDays, streak } from './streak';
import { db } from '@/storage/database';
import { enqueue } from '@/storage/outbox';
import { streakEvents } from '@/storage/schema';
import type { Day } from '@/workout/plan/day';
import { findOpenWorkout, setRows, workoutRows } from '@/workout/store';

/**
 * Writes the freezes the rules gave days already over, each new one with its outbox row. Run at launch and
 * at each new day; a second run adds nothing, and an event another phone wrote for the same day is the same row.
 * Waits while a workout is open: one started at 23:58 may still make yesterday alive.
 */
export function keepFreezes(today: Day) {
  if (findOpenWorkout()) return;
  const { events } = streak(aliveDays(workoutRows().sync(), setRows().sync()), today);
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
