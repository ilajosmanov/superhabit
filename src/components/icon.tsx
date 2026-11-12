import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import light from 'expo-symbols/androidWeights/light';

import { useColors } from './colors';

// shortcut: Material Symbols only; give `name` its SF Symbol (`{ ios, android }`) when iOS ships.
/**
 * A Material Symbol, light like the design's 1.5px line, chalk unless told. Decorative: whatever holds it
 * (a button, a labelled row) says what it means, so TalkBack skips the symbol's font character.
 */
export function Icon({
  name,
  size = 24,
  color: given,
}: {
  name: AndroidSymbol;
  size?: number;
  color?: string;
}) {
  const colors = useColors();
  const color = given ?? colors.chalk;
  return (
    <SymbolView
      name={{ android: name }}
      weight={{ ios: 'light', android: light }}
      size={size}
      tintColor={color}
      importantForAccessibility="no-hide-descendants"
    />
  );
}
