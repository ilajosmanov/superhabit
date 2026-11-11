import { eq } from 'drizzle-orm';

import { db } from '@/storage/database';
import { settings } from '@/storage/schema';

const KEY = 'league_result_seen';

/** The last week whose close you've seen on this phone (its Monday); null if none yet. */
export function resultSeen(): string | null {
  try {
    const value = db().select().from(settings).where(eq(settings.key, KEY)).get()?.value;
    return typeof value === 'string' ? value : null;
  } catch (error) {
    // Unread, last week's close shows once more: never worth losing the tab over.
    console.warn('[leaderboard] seen', error);
    return null;
  }
}

/** Remembers you've seen how `week` closed, so it isn't shown again. */
export function seeResult(week: string) {
  try {
    db()
      .insert(settings)
      .values({ key: KEY, value: week })
      .onConflictDoUpdate({ target: settings.key, set: { value: week } })
      .run();
  } catch (error) {
    // Not kept, it shows once more next launch: no worse than that.
    console.warn('[leaderboard] seen', error);
  }
}
