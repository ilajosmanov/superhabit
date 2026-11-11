import { BottomSheet, RNHostView, ScrollView } from '@expo/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { colors } from '@/theme';

/** The platform bottom sheet (Material 3 on Android) with our own views inside, as tall as they are. */
export function Sheet({
  open,
  onDismiss,
  children,
}: {
  open: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <BottomSheet
      isPresented={open}
      onDismiss={onDismiss}
      containerColor={colors.surface}
      contentPadding={0}
    >
      {/* Scrolls only when its content (large text, a long list) outgrows the screen. */}
      <ScrollView>
        {/* Width from the sheet, height from the views, so the text wraps and the sheet fits it. */}
        <RNHostView matchContents={{ vertical: true }}>
          <View className="gap-6 px-6 pb-6 pt-2">{children}</View>
        </RNHostView>
      </ScrollView>
    </BottomSheet>
  );
}
