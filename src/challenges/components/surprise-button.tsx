import type { ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { IconButton } from '@/components/icon-button';
import { DieFigure } from '@/components/illustrations';

/**
 * The surprise card's die as an icon button that opens a random set (`onPress`: a `useSurprise` pick).
 * Each press rolls the die one quick turn (0.6 s): a full turn of the cube lands on the same outline, so
 * it reads as a tumble. Only the die turns, around its centre. Reanimated skips the turn when the phone
 * asks for less motion.
 */
export function SurpriseButton({ onPress, style }: { onPress: () => void; style?: ViewStyle }) {
  const turn = useSharedValue(0);
  const rolling = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <IconButton
      label="Do a random set"
      onPress={() => {
        turn.set(
          withTiming(turn.get() + 360, {
            duration: 600,
            easing: Easing.inOut(Easing.ease),
          }),
        );
        onPress();
      }}
      style={style}
      figure={
        <Animated.View style={rolling}>
          {/* About the 1.5px line of the symbols at this size. */}
          <DieFigure size={28} weight={1.7} />
        </Animated.View>
      }
    />
  );
}
