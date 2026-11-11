import { AppState } from 'react-native';
import { fromCallback } from 'xstate';

import { nextMidnight, today, type Day } from '@/lib/day';

export type DayEvent = { type: 'day'; day: Day };

/**
 * Tells its parent what day it is (`{ type: 'day', day }`): at the start, at each local midnight, and
 * whenever the app comes back to the front (a timer can fire late or not at all while the phone sleeps).
 * It also looks once a minute and tells a new day, so a time zone change while the app is in front shows
 * within a minute (React Native has no time zone event).
 */
export const dayClock = fromCallback<DayEvent>(({ sendBack }) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let told: Day | undefined;
  const tell = (always: boolean) => {
    const day = today();
    if (always || day !== told) sendBack({ type: 'day', day });
    told = day;
    clearTimeout(timer);
    timer = setTimeout(() => tell(false), Math.min(nextMidnight().getTime() - Date.now(), 60_000));
  };
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active') tell(true);
  });
  tell(true);
  return () => {
    clearTimeout(timer);
    foreground.remove();
  };
});
