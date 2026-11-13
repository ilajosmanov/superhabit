import { BottomSheet, BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import { Column, Host, ModalBottomSheet, RNHostView } from '@expo/ui/jetpack-compose';
import { verticalScroll, weight } from '@expo/ui/jetpack-compose/modifiers';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from './colors';

/**
 * The platform sheet, opened at its content height, with scrolling only when it outgrows the window.
 * The `footer` ends the scroll; `pinFooter` lifts it out, so the content scrolls under it and the
 * keyboard can't cover it.
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
  if (Platform.OS === 'android') {
    if (!open) return null;
    return (
      <Host style={StyleSheet.absoluteFill} pointerEvents="none">
        <ModalBottomSheet
          onDismissRequest={onDismiss}
          skipPartiallyExpanded
          containerColor={colors.surface}
          contentColor={colors.chalk}
        >
          {/* The native scroll viewport follows the sheet window, including its keyboard insets.
              A content-sized RN ScrollView instead measures against the activity's full height. */}
          <Column>
            {/* Compose's weight always fills, so pinning stretches the sheet to full height. Unpinned,
                the footer stays in the scroll: a sibling under tall content would be measured out. */}
            <Column modifiers={pinned ? [weight(1), verticalScroll()] : [verticalScroll()]}>
              <RNHostView matchContents={{ vertical: true }}>
                {/* style, not className: a swapped class remounts the view and drops the field's focus. */}
                <View className="gap-6 px-6 pt-2" style={{ paddingBottom: pinned ? 0 : 16 }}>
                  {children}
                  {!pinned && footer}
                </View>
              </RNHostView>
            </Column>
            {pinned && (
              <RNHostView matchContents={{ vertical: true }}>
                <View className="px-6 pb-4 pt-6">{footer}</View>
              </RNHostView>
            )}
          </Column>
        </ModalBottomSheet>
      </Host>
    );
  }
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
        // shortcut: a pinned footer is assumed to be one 60 key row (plus its 40 of padding), the only
        // caller's, and the keyboard's height isn't taken off, so a tall sheet can push the footer
        // under it. Measure both (onLayout, the keyboard's height) before iOS ships.
        style={{ flexGrow: 0, maxHeight: height - top - bottom - 56 - (pinned ? 100 : 0) }}
        contentContainerClassName="gap-6 px-6 pb-4 pt-2"
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
