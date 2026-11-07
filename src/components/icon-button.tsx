import {
  FilledIconButton,
  FilledIconToggleButton,
  Host,
  IconButton as ComposeIconButton,
  IconToggleButton,
  RNHostView,
} from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import type { AndroidSymbol } from 'expo-symbols';
import type { ViewStyle } from 'react-native';

import { colors } from '@/theme';

import { Icon } from './icon';

/**
 * Material's icon button around a Material Symbol: a 48dp target and the platform ripple. `fill` gives
 * it a disc (glass over the camera); `checked` makes it a switch. `style` places the Compose host.
 */
export function IconButton({
  icon,
  label,
  onPress,
  checked,
  size = 24,
  color = colors.chalk,
  fill,
  style,
}: {
  icon: AndroidSymbol;
  label: string;
  onPress: () => void;
  checked?: boolean;
  size?: number;
  color?: string;
  fill?: string;
  style?: ViewStyle;
}) {
  const content = (
    <RNHostView matchContents>
      <Icon name={icon} size={size} color={color} />
    </RNHostView>
  );
  const modifiers = [semantics({ contentDescription: label })];
  const containerColor = fill ?? 'transparent';
  const Toggle = fill ? FilledIconToggleButton : IconToggleButton;
  const Button = fill ? FilledIconButton : ComposeIconButton;
  return (
    <Host matchContents style={style}>
      {checked === undefined ? (
        <Button
          onClick={onPress}
          colors={{ containerColor, contentColor: color }}
          modifiers={modifiers}
        >
          {content}
        </Button>
      ) : (
        <Toggle
          checked={checked}
          onCheckedChange={onPress}
          colors={{
            containerColor,
            checkedContainerColor: containerColor,
            contentColor: color,
            checkedContentColor: color,
          }}
          modifiers={modifiers}
        >
          {content}
        </Toggle>
      )}
    </Host>
  );
}
