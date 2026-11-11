import { Host, RNHostView, Text, TextButton as ComposeTextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import type { AndroidSymbol } from 'expo-symbols';
import type { ViewStyle } from 'react-native';

import { colors } from '@/theme';

import { Icon } from './icon';

/** Material's text button ("Leave challenge", "Done"): a 48dp target and the platform ripple, in Geist. */
export function TextButton({
  label,
  onPress,
  icon,
  color = colors.chalk,
  disabled = false,
  wide = false,
  edge = false,
  style,
}: {
  label: string;
  onPress: () => void;
  /** A leading Material Symbol. */
  icon?: AndroidSymbol;
  color?: string;
  disabled?: boolean;
  /** As wide as its parent, like the primary above it, so the press ripple matches. */
  wide?: boolean;
  /** At the end of a row: its 12dp of padding overhang, so what it shows lines up with the row's end. */
  edge?: boolean;
  /** Places the Compose host. */
  style?: ViewStyle;
}) {
  return (
    <Host
      matchContents={wide ? { vertical: true } : true}
      style={edge ? { marginRight: -12, ...style } : style}
    >
      <ComposeTextButton
        onClick={onPress}
        enabled={!disabled}
        modifiers={wide ? [fillMaxWidth()] : undefined}
      >
        {icon && (
          <RNHostView matchContents>
            <Icon name={icon} size={16} color={disabled ? colors.muted : color} />
          </RNHostView>
        )}
        <Text color={disabled ? colors.muted : color} style={{ fontFamily: 'Geist', fontSize: 16 }}>
          {label}
        </Text>
      </ComposeTextButton>
    </Host>
  );
}
