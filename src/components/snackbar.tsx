import { Host, Snackbar, SnackbarHost, type SnackbarHostRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from './colors';

const Notice = createContext<((message: string) => void) | null>(null);

/** One native snackbar host above the app's footer. Compose owns its queue and dismissal timeout. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { bottom } = useSafeAreaInsets();
  const host = useRef<SnackbarHostRef>(null);
  const show = (message: string) => {
    void host.current?.showSnackbar({ message, duration: 'short' });
  };
  return (
    <Notice value={show}>
      {children}
      <Host
        matchContents={{ vertical: true }}
        pointerEvents="none"
        style={{ position: 'absolute', left: 24, right: 24, bottom: bottom + 88 }}
      >
        <SnackbarHost ref={host} modifiers={[fillMaxWidth()]}>
          <Snackbar containerColor={colors.chalk} contentColor={colors.ground} />
        </SnackbarHost>
      </Host>
    </Notice>
  );
}

/** Null on the root crash screen, which keeps its own confirmation when the app tree has failed. */
export const useSnackbar = () => useContext(Notice);
