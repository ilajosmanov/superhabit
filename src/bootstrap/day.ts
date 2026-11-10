import { AppState } from 'react-native';
import { fromCallback } from 'xstate';

import { nextMidnight, today, type Day } from '@/workout/plan/day';

export type DayEvent = { type: 'day'; day: Day };

/**
 * Tells its parent what day it is (`{ type: 'day', day }`): at the start, at each local midnight, and
 * whenever the app comes back to the front (a timer can fire late or not at all while the phone sleeps).
 */
export const dayClock = fromCallback<DayEvent>(({ sendBack }) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tell = () => {
    sendBack({ type: 'day', day: today() });
    clearTimeout(timer);
    timer = setTimeout(tell, nextMidnight().getTime() - Date.now());
  };
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active') tell();
  });
  tell();
  return () => {
    clearTimeout(timer);
    foreground.remove();
  };
});
