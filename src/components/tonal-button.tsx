import { FilledTonalButton, Host, RNHostView, Spacer, Text } from '@expo/ui/jetpack-compose';
import { height, width } from '@expo/ui/jetpack-compose/modifiers';
import type { AndroidSymbol } from 'expo-symbols';

import { BUTTON_ICON_GAP, COMPOSE_LABEL } from '@/theme';
import { useColors } from './colors';

import { Icon } from './icon';

/** Material's filled tonal button: a footer's second action with the amber key, as tall (60dp). */
export function TonalButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  /** A leading Material Symbol. */
  icon?: AndroidSymbol;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Host matchContents>
      <FilledTonalButton
        onClick={onPress}
        colors={{ containerColor: colors.line, contentColor: colors.chalk }}
        contentPadding={{ start: icon ? 20 : 24, end: 24 }}
        modifiers={[height(60)]}
      >
        {icon && (
          <RNHostView matchContents>
            <Icon name={icon} size={20} />
          </RNHostView>
        )}
        {icon && <Spacer modifiers={[width(BUTTON_ICON_GAP)]} />}
        <Text color={colors.chalk} style={{ ...COMPOSE_LABEL, fontSize: 17 }}>
          {label}
        </Text>
      </FilledTonalButton>
    </Host>
  );
}
