import { Button, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityLabel,
  accessibilityValue,
  buttonBorderShape,
  buttonStyle,
  disabled as off,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { AndroidSymbol } from 'expo-symbols';
import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';

import { useColors } from './colors';

import { Icon } from './icon';

/**
 * iOS's icon button around a symbol (or a `figure` of our own): a 44pt target. `fill` gives it a disc (glass
 * over the camera), `diameter` sizes that disc; `checked` makes it a switch, read out as on or off.
 */
export function IconButton({
  icon,
  figure,
  label,
  onPress,
  checked,
  disabled = false,
  size = 24,
  color: given,
  fill,
  diameter,
  edge = false,
  style,
}: {
  label: string;
  onPress: () => void;
  checked?: boolean;
  disabled?: boolean;
  size?: number;
  color?: string;
  fill?: string;
  diameter?: number;
  /** At the end of a row: its padding overhangs, so what it shows lines up with the row's end. */
  edge?: boolean;
  style?: ViewStyle;
} & (
  | { icon: AndroidSymbol; figure?: undefined }
  | {
      icon?: undefined;
      /** Drawn instead of a symbol. */
      figure: ReactElement;
    }
)) {
  const colors = useColors();
  const color = given ?? colors.chalk;
  const side = diameter ?? 44;
  return (
    <Host matchContents style={edge ? { marginRight: -10, ...style } : style}>
      <Button
        onPress={onPress}
        modifiers={[
          fill ? buttonStyle('borderedProminent') : buttonStyle('borderless'),
          ...(fill ? [buttonBorderShape('circle'), tint(fill)] : []),
          frame({ minWidth: side, minHeight: side }),
          accessibilityLabel(label),
          ...(checked === undefined
            ? []
            : [accessibilityValue(checked ? 'On' : 'Off'), accessibilityAddTraits(['isToggle'])]),
          off(disabled),
        ]}
      >
        <RNHostView matchContents>
          {figure ?? (icon ? <Icon name={icon} size={size} color={color} /> : <></>)}
        </RNHostView>
      </Button>
    </Host>
  );
}
