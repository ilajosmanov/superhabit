import { AppState } from 'react-native';
import { fromCallback } from 'xstate';

export type AwayEvent = { type: 'away' } | { type: 'back' };

/** Tells the session when the app leaves the screen (`away`) and comes back (`back`). */
export const appAway = fromCallback<AwayEvent>(({ sendBack }) => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'background') sendBack({ type: 'away' });
    if (state === 'active') sendBack({ type: 'back' });
  });
  return () => subscription.remove();
});
