import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glyph } from '@/components/glyph';
import { colors } from '@/theme';

const BELL = 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0';

/** A tab screen: 44px hairline header with the bell, 48px title, 32px between sections. */
export function Screen({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children?: ReactNode;
}) {
  const { top } = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-ground"
      contentContainerClassName="gap-8 px-6 pb-8"
      contentContainerStyle={{ paddingTop: top + 20 }}
    >
      <View className="h-11 flex-row items-center justify-between border-b border-line">
        <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
        {/* shortcut: the bell does nothing until notifications exist; give it an onPress then. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          android_ripple={{ color: colors.line, borderless: true, radius: 22 }}
          className="-mr-3 size-11 items-center justify-center"
        >
          <Glyph d={BELL} size={20} />
        </Pressable>
      </View>

      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.3}
        className="font-sans text-5xl font-extralight leading-tight tracking-tighter text-chalk"
      >
        {title}
      </Text>

      {children}
    </ScrollView>
  );
}
