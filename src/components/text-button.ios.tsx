import { Button, Host } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  disabled as off,
  font,
  foregroundStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import type { AndroidSymbol } from 'expo-symbols';
import type { ViewStyle } from 'react-native';

import { useColors } from './colors';
import { sfSymbol } from './icon';

/** iOS's borderless text button ("Leave challenge", "Done"), in Geist; the Android file holds Material's. */
export function TextButton({
  label,
  onPress,
  icon,
  color: given,
  disabled = false,
  wide = false,
  edge = false,
  style,
}: {
  label: string;
  onPress: () => void;
  /** A leading symbol, by its Material name. */
  icon?: AndroidSymbol;
  color?: string;
  disabled?: boolean;
  /** As wide as its parent, like the primary above it. */
  wide?: boolean;
  /** At the end of a row: no overhang on iOS, whose borderless button has no padding to hide. */
  edge?: boolean;
  /** Places the SwiftUI host. */
  style?: ViewStyle;
}) {
  const colors = useColors();
  const color = disabled ? colors.muted : (given ?? colors.chalk);
  void edge;
  return (
    <Host matchContents={wide ? { vertical: true } : true} style={style}>
      <Button
        label={label}
        systemImage={icon && sfSymbol(icon)}
        onPress={onPress}
        modifiers={[
          buttonStyle('borderless'),
          font({ family: 'Geist', size: 16 }),
          foregroundStyle(color),
          off(disabled),
          ...(wide ? [frame({ maxWidth: 10_000, minHeight: 48 })] : [frame({ minHeight: 44 })]),
        ]}
      />
    </Host>
  );
}
