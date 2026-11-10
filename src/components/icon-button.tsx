import {
  FilledIconButton,
  FilledIconToggleButton,
  Host,
  IconButton as ComposeIconButton,
  IconToggleButton,
  RNHostView,
} from '@expo/ui/jetpack-compose';
import { semantics, size as sizeOf } from '@expo/ui/jetpack-compose/modifiers';
import type { AndroidSymbol } from 'expo-symbols';
import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';

import { colors } from '@/theme';

import { Icon } from './icon';

/**
 * Material's icon button around a Material Symbol (or a `figure` of our own): a 48dp target and the
 * platform ripple. `fill` gives it a disc (glass over the camera), `diameter` sizes that disc; `checked`
 * makes it a switch. `style` places the Compose host.
 */
export function IconButton({
  icon,
  figure,
  label,
  onPress,
  checked,
  size = 24,
  color = colors.chalk,
  fill,
  diameter,
  style,
}: {
  icon?: AndroidSymbol;
  /** Drawn instead of a symbol. */
  figure?: ReactElement;
  label: string;
  onPress: () => void;
  checked?: boolean;
  size?: number;
  color?: string;
  fill?: string;
  diameter?: number;
  style?: ViewStyle;
}) {
  const content = (
    <RNHostView matchContents>
      {figure ?? (icon ? <Icon name={icon} size={size} color={color} /> : <></>)}
    </RNHostView>
  );
  const modifiers = [
    semantics({ contentDescription: label }),
    ...(diameter ? [sizeOf(diameter, diameter)] : []),
  ];
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
