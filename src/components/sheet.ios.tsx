import { BottomSheet, BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from './colors';

/**
 * iOS's sheet, opened at its content height, with scrolling only when it outgrows the window. The
 * `footer` ends the scroll; `pinFooter` lifts it out under the scroll, so the keyboard can't cover it.
 */
export function Sheet({
  open,
  onDismiss,
  children,
  footer,
  pinFooter = false,
}: {
  open: boolean;
  onDismiss: () => void;
  children: ReactNode;
  footer?: ReactNode;
  pinFooter?: boolean;
}) {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const pinned = pinFooter && footer !== undefined;
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
        contentContainerClassName="gap-6 px-6 pt-2"
        contentContainerStyle={{ paddingBottom: pinned ? 0 : 16 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {children}
        {!pinned && footer}
      </BottomSheetScrollView>
      {pinned && <View className="px-6 pb-4 pt-6">{footer}</View>}
    </BottomSheet>
  );
}
