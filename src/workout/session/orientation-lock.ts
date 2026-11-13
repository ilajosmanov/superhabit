import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';
import { fromCallback } from 'xstate';

import type { Orientation } from '@/exercises/exercise';

type LockEvent = { type: 'lock'; orientation: Orientation };

/** Locks the UI to the input orientation, re-locks on each `lock`, and restores portrait (the app's) on stop. */
export const orientationLock = fromCallback<LockEvent, Orientation>(({ input, receive }) => {
  const { lockAsync, OrientationLock } = ScreenOrientation;
  // LANDSCAPE, not one side: the phone may lie on either long edge.
  const lock = (o: Orientation) =>
    void lockAsync(
      // PORTRAIT, not PORTRAIT_UP: the phone may stand on either short edge (a cable below needs the flip).
      // iPhones without a home button have no upside-down portrait, and locking to it fails there.
      o === 'landscape'
        ? OrientationLock.LANDSCAPE
        : Platform.OS === 'ios'
          ? OrientationLock.PORTRAIT_UP
          : OrientationLock.PORTRAIT,
    ).catch((error) => console.warn('[orientation] could not lock', error));
  lock(input);
  receive((event) => lock(event.orientation));
  return () => lock('portrait');
});
