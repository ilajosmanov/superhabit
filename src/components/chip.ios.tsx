import { Button, Host } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  buttonBorderShape,
  buttonStyle,
  disabled as off,
  font,
  foregroundStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { AndroidSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useColors } from './colors';
import { sfSymbol } from './icon';

/** iOS's capsule button as a filter chip: bordered until picked, then filled. Put it in a `ChipRow`. */
export function Chip({
  label,
  count,
  selected,
  enabled = true,
  onPress,
}: {
  label: string;
  /** A number after the label: how many the chip holds. */
  count?: number;
  selected: boolean;
  enabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Host matchContents>
      <Button
        label={count === undefined ? label : `${label}  ${count}`}
        onPress={onPress}
        modifiers={[
          buttonStyle(selected ? 'borderedProminent' : 'bordered'),
          buttonBorderShape('capsule'),
          tint(colors.line),
          foregroundStyle(selected ? colors.chalk : colors.soft),
          font({ family: 'Geist', size: 15, weight: 'medium' }),
          off(!enabled),
          ...(selected ? [accessibilityAddTraits(['isSelected'])] : []),
        ]}
      />
    </Host>
  );
}

/** iOS's filled capsule with a leading symbol: an action among filter chips. */
export function ActionChip({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: AndroidSymbol;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Host matchContents>
      <Button
        label={label}
        systemImage={sfSymbol(icon)}
        onPress={onPress}
        modifiers={[
          buttonStyle('borderedProminent'),
          buttonBorderShape('capsule'),
          tint(colors.line),
          foregroundStyle(colors.chalk),
          font({ family: 'Geist', size: 15, weight: 'medium' }),
        ]}
      />
    </Host>
  );
}

/** A thin upright rule between chip groups. */
export function ChipDivider() {
  const colors = useColors();
  return <View style={{ width: 1, height: 20, backgroundColor: colors.line }} />;
}

/**
 * Chips in a row: `scroll` sideways in one line (inset by `inset` at both ends), or else wrapping, as wide
 * as the parent. Each chip is its own SwiftUI host, so plain views lay them out.
 */
export function ChipRow({
  scroll = false,
  inset = 0,
  children,
}: {
  scroll?: boolean;
  inset?: number;
  children: ReactNode;
}) {
  if (!scroll) return <View className="flex-row flex-wrap gap-2">{children}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: inset }}
    >
      {children}
    </ScrollView>
  );
}
