import { Pressable, Text, View } from 'react-native';

import { lit } from '@/theme';

import { useColors } from './colors';

/** The screen's one action, as a tap: the lit amber key, dimmed while `disabled`. `className` sizes it. */
export function PrimaryButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  className = 'h-15',
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const colors = useColors();
  return (
    // The wrapper takes the size and clips the ripple to the pill.
    <View
      className={`overflow-hidden rounded-full ${className}`}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        // Ink at 16 %, like HoldToStart's fill.
        android_ripple={{ color: `${colors.ink}29` }}
        onPress={onPress}
        disabled={disabled}
        accessibilityState={{ disabled }}
        className="flex-1 items-center justify-center bg-accent px-4"
        style={lit}
      >
        <Text numberOfLines={1} className="font-sans text-lg font-semibold tracking-tight text-ink">
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
