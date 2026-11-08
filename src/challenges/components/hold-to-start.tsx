import * as Haptics from 'expo-haptics';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, lit } from '@/theme';

const HOLD_MS = 700;

/**
 * Starting opens the camera run, so it takes a deliberate press and hold; the pill fills as you hold.
 * Lit from above (lighter top, darker lip) so it reads as a physical key, not a flat shape.
 */
export function HoldToStart({
  onStart,
  again = false,
}: {
  onStart: () => void;
  /** Today's session is done already: the key says you go again. */
  again?: boolean;
}) {
  const progress = useSharedValue(0);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }));
  const start = () => {
    void (Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    onStart();
  };

  return (
    <View className="overflow-hidden rounded-full">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={again ? 'Go again' : 'Start'}
        // Screen readers can't hold: their double tap starts right away.
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={start}
        onPressIn={() => {
          progress.set(
            withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (done) => {
              if (done) scheduleOnRN(start);
            }),
          );
        }}
        // Letting go early cancels (the timing callback then gets done = false) and drains the fill.
        onPressOut={() => {
          progress.set(withTiming(0, { duration: 200 }));
        }}
        className="h-15 items-center justify-center bg-accent"
        style={lit}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              inset: 0,
              backgroundColor: colors.ground,
              opacity: 0.16,
              transformOrigin: 'left',
            },
            fill,
          ]}
        />
        <Text className="font-sans text-lg font-semibold tracking-tight text-ground">
          {again ? 'Hold to go again' : 'Hold to start'}
        </Text>
      </Pressable>
    </View>
  );
}
