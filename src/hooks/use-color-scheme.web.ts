import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useColorScheme() {
  // Match the server's light theme until hydration finishes.
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const scheme = useRNColorScheme();

  return hydrated ? scheme : 'light';
}
