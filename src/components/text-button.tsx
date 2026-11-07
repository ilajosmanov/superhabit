import { Host, RNHostView, Text, TextButton as ComposeTextButton } from '@expo/ui/jetpack-compose';
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
  style,
}: {
  label: string;
  onPress: () => void;
  /** A leading Material Symbol. */
  icon?: AndroidSymbol;
  color?: string;
  /** Places the Compose host. */
  style?: ViewStyle;
}) {
  return (
    <Host matchContents style={style}>
      <ComposeTextButton onClick={onPress}>
        {icon && (
          <RNHostView matchContents>
            <Icon name={icon} size={16} color={color} />
          </RNHostView>
        )}
        <Text color={color} style={{ fontFamily: 'Geist', fontSize: 16 }}>
          {label}
        </Text>
      </ComposeTextButton>
    </Host>
  );
}
