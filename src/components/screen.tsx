import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Every screen's skeleton: 48px title, 32px between sections.
 * Tab screens pass a `label` (44px hairline row pinned under the status bar; content scrolls beneath it). Pushed screens omit it: they sit
 * under the native stack header, which already clears the status bar, and may pin a `footer`.
 */
export function Screen({
  label,
  title,
  intro,
  footer,
  children,
}: {
  label?: string;
  title: string;
  /** One paragraph under the title. */
  intro?: string;
  /** Pinned under the scroll, above the system bar: the screen's one action. */
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const { top, bottom } = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-ground">
      {label && (
        <View className="px-6" style={{ paddingTop: top + 20 }}>
          <View className="h-11 justify-center border-b border-line">
            <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
          </View>
        </View>
      )}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-8 px-6 pb-8"
        contentContainerStyle={{ paddingTop: label ? 32 : 8 }}
      >
        <View className="gap-3">
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
            className="font-sans text-5xl font-extralight leading-tight tracking-tighter text-chalk"
          >
            {title}
          </Text>
          {intro && <Text className="font-sans text-base leading-normal text-soft">{intro}</Text>}
        </View>

        {children}
      </ScrollView>

      {footer && (
        <View className="px-6 pt-4" style={{ paddingBottom: bottom + 16 }}>
          {footer}
        </View>
      )}
    </View>
  );
}
