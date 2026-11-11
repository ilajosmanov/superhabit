import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The side padding of every screen (`px-6`): content is the window's width less two of these. */
export const GUTTER = 24;

/**
 * Every screen's skeleton: 48px title, 32px between sections.
 * Tab screens pass a `label` (44px hairline row pinned under the status bar; content scrolls beneath it). Pushed screens omit it: they sit
 * under the native stack header, which already clears the status bar, and may pin a `footer`.
 */
export function Screen({
  label,
  action,
  title,
  intro,
  footer,
  children,
}: {
  label?: string;
  /** A control at the end of the label row: the tab's own quick action. */
  action?: ReactNode;
  /** Omitted when the screen draws its own heading. */
  title?: string;
  /** One paragraph under the title. */
  intro?: string;
  /** Pinned under the scroll, 16px above the system bar (a tab screen's tab bar already clears it). */
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const { top, bottom } = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-ground">
      {label && (
        <View className="px-6" style={{ paddingTop: top + 20 }}>
          <View className="h-11 flex-row items-center justify-between border-b border-line">
            <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
            {action}
          </View>
        </View>
      )}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-8 px-6 pb-8"
        contentContainerStyle={{ paddingTop: label ? 32 : 8 }}
      >
        {title && (
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
        )}

        {children}
      </ScrollView>

      {footer && (
        <View className="px-6 pt-4" style={{ paddingBottom: (label ? 0 : bottom) + 16 }}>
          {footer}
        </View>
      )}
    </View>
  );
}
