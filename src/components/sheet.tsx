import { BottomSheet, BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from './colors';

/** The platform sheet, opened at its content height, with scrolling only when it outgrows the window. */
export function Sheet({
  open,
  onDismiss,
  children,
}: {
  open: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  return (
    <BottomSheet
      index={open ? 0 : -1}
      onClose={onDismiss}
      enableDynamicSizing
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      {/* Leave room for the native handle and system bars; short sheets keep their intrinsic height. */}
      <BottomSheetScrollView
        style={{ flexGrow: 0, maxHeight: height - top - bottom - 56 }}
        contentContainerClassName="gap-6 px-6 pb-4 pt-2"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
