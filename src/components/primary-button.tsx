import { Pressable, Text, View } from 'react-native';

import { lit } from '@/theme';

/** The screen's one action, as a tap: the lit amber key. `className` sizes it. */
export function PrimaryButton({
  label,
  accessibilityLabel,
  onPress,
  className = 'h-15',
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    // The wrapper takes the size and clips the ripple to the pill.
    <View className={`overflow-hidden rounded-full ${className}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        // Ground at 16 %, like HoldToStart's fill.
        android_ripple={{ color: 'rgba(13,14,11,0.16)' }}
        onPress={onPress}
        className="flex-1 items-center justify-center bg-accent px-4"
        style={lit}
      >
        <Text
          numberOfLines={1}
          className="font-sans text-lg font-semibold tracking-tight text-ground"
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
