import { Button, Host } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { AndroidSymbol } from 'expo-symbols';

import { useColors } from './colors';
import { sfSymbol } from './icon';

/** iOS's bordered button: a footer's second action beside the amber key, as tall. */
export function TonalButton({
  label,
  icon,
  onPress,
  wide = false,
}: {
  label: string;
  /** A leading symbol, by its Material name. */
  icon?: AndroidSymbol;
  onPress: () => void;
  /** Fills the row, for a footer where it is the only action. */
  wide?: boolean;
}) {
  const colors = useColors();
  return (
    <Host matchContents={wide ? { vertical: true } : true}>
      <Button
        label={label}
        systemImage={icon && sfSymbol(icon)}
        onPress={onPress}
        modifiers={[
          buttonStyle('bordered'),
          controlSize('extraLarge'),
          tint(colors.line),
          foregroundStyle(colors.chalk),
          font({ family: 'Geist', size: 17, weight: 'medium' }),
          ...(wide ? [frame({ maxWidth: 10_000 })] : []),
        ]}
      />
    </Host>
  );
}
