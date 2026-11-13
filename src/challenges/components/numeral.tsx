import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useColors } from '@/components/colors';

/**
 * A page's giant number with its words in a column on the right, amber once `met`; TalkBack reads it as
 * one stop. Clipped so a new number rises out of its baseline.
 */
export function Numeral({
  n,
  labels,
  met,
}: {
  n: number | string;
  labels: readonly string[];
  met: boolean;
}) {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${n} ${labels.join(' ')}`.toLowerCase()}
      // The row, not the digits, sits 6px out: clipping the rise must not cut the first digit's edge.
      className="-ml-1.5 flex-row items-end justify-between overflow-hidden"
    >
      {/* Keyed on the words too: hitting a goal exactly keeps the number and still rises. */}
      <Animated.View key={`${n} ${labels.join(' ')}`} entering={FadeInDown.duration(500)}>
        <Text
          // Already giant: a larger system font would only push it off the screen.
          maxFontSizeMultiplier={1}
          className="font-sans text-9xl font-extralight leading-none tracking-tighter ios:leading-[1.15]"
          style={{ color: met ? colors.mark : colors.chalk }}
        >
          {n}
        </Text>
      </Animated.View>
      <View className="items-end gap-1 pb-4">
        {labels.map((label) => (
          <Text key={label} className="font-mono text-xs tracking-widest text-muted">
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}
