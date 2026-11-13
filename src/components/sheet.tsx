import { Column, Host, ModalBottomSheet, RNHostView } from '@expo/ui/jetpack-compose';
import { verticalScroll, weight } from '@expo/ui/jetpack-compose/modifiers';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useColors } from './colors';

/**
 * Material's sheet (the iOS file holds iOS's), opened at its content height, with scrolling only when it outgrows the window.
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
  const pinned = pinFooter && footer !== undefined;
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
