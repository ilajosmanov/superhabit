import { useIsFocused } from 'expo-router';
import type { ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { IconButton } from '@/components/icon-button';
import { DieFigure } from '@/components/illustrations';

// One quick turn (0.6 s), then still for the rest of each 5 s.
const ROLL = {
  '0%': { transform: [{ rotate: '0deg' }] },
  '12%': { transform: [{ rotate: '360deg' }] },
  '100%': { transform: [{ rotate: '360deg' }] },
};

/**
 * The surprise card's die as an icon button that opens a random set (`onPress`: a `useSurprise` pick),
 * rolling now and then: a full turn of the cube lands on the same outline, so it reads as a tumble. Only
 * the die turns, around its centre. The roll pauses while its tab is hidden (tabs stay mounted) and stays
 * still when the phone asks for less motion.
 */
export function SurpriseButton({ onPress, style }: { onPress: () => void; style?: ViewStyle }) {
  const still = useReducedMotion();
  const focused = useIsFocused();
  return (
    <IconButton
      label="Do a random set"
      onPress={onPress}
      style={style}
      figure={
        <Animated.View
          style={{
            animationName: still ? 'none' : ROLL,
            animationDuration: '5s',
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-in-out',
            animationPlayState: focused ? 'running' : 'paused',
          }}
        >
          {/* About the 1.5px line of the symbols at this size. */}
          <DieFigure size={28} weight={1.7} />
        </Animated.View>
      }
    />
  );
}
