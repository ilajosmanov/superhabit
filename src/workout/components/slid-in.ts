import { useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';

// shortcut: subscribes after the first commit, so a page that suspends past its slide (async routes) would
// miss the event and stay blank; record transitionEnd in the root stack's screenListeners then.
/**
 * Whether this pushed page has finished sliding in (the native stack's `transitionEnd`; React Native
 * 0.88 has no InteractionManager). The workout's camera waits for it: mounted mid-slide, it held up
 * the slide's frames.
 */
export function useSlidIn() {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  // Once in, it stays in: the closing slide must not take the page apart under the user.
  const [slid] = useState(() => {
    let done = false;
    return {
      subscribe: (notify: () => void) =>
        navigation.addListener('transitionEnd', ({ data }) => {
          if (data.closing || done) return;
          done = true;
          notify();
        }),
      get: () => done,
    };
  });
  return useSyncExternalStore(slid.subscribe, slid.get);
}
