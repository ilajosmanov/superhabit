import type { ReactNode, RefObject } from 'react';
import { RefreshControl, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from './colors';

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
  refresh,
  pin,
  scroll,
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
  /** Pull down to read again: the platform's spinner shows while `refreshing`. */
  refresh?: { refreshing: boolean; onRefresh: () => void };
  /**
   * Which of `children` pins under the label row once scrolled to it. Counted as the ScrollView counts:
   * pass children as separate elements, and keep any `cond && <X />` before it always rendering an
   * element, or the index lands on the wrong child.
   */
  pin?: number;
  /** For a screen that scrolls itself (back to a list's start): the scroll view. */
  scroll?: RefObject<ScrollViewInstance | null>;
  children?: ReactNode;
}) {
  const colors = useColors();
  const { top, bottom } = useSafeAreaInsets();
  return (
    // Under a label it is a tab: the hairline is the tab bar's top edge (Material's bar draws none).
    <View className={`flex-1 bg-ground ${label ? 'border-b border-line' : ''}`}>
      {label && (
        <View className="px-6" style={{ paddingTop: top + 20 }}>
          <View className="h-11 flex-row items-center justify-between border-b border-line">
            <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
            {action}
          </View>
        </View>
      )}

      <ScrollView
        ref={scroll}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        // The title, when there is one, is the scroll's first child.
        stickyHeaderIndices={pin === undefined ? undefined : [(title ? 1 : 0) + pin]}
        contentContainerClassName="gap-8 px-6 pb-8"
        contentContainerStyle={{ paddingTop: label ? 32 : 8 }}
        refreshControl={
          refresh && (
            <RefreshControl
              {...refresh}
              colors={[colors.chalk]}
              progressBackgroundColor={colors.surface}
            />
          )
        }
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
