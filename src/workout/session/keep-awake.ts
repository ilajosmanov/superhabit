import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { fromCallback, type EventObject } from 'xstate';

/** A session releases its own wake lock on Done or teardown, even if activation is still in flight. */
export const keepAwake = fromCallback<EventObject, string>(({ input }) => {
  const active = activateKeepAwakeAsync(input);
  void active.catch((error) => console.warn('[session] could not keep the screen awake', error));
  return () => {
    void active
      .then(() => deactivateKeepAwake(input))
      .catch((error) => console.warn('[session] could not release the wake lock', error));
  };
});
