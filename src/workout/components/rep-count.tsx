import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

const SIZES = {
  lg: { numeral: 'text-9xl', target: 'pb-2.5 text-3xl' },
  md: { numeral: 'text-8xl', target: 'pb-2 text-2xl' },
  sm: { numeral: 'text-7xl', target: 'pb-1.5 text-xl' },
};

/**
 * Big rep count, with "/target" for a finite set. `flash` lights the numeral accent at once,
 * then fades it back to chalk over 600 ms (a Reanimated CSS transition on an accent copy's opacity).
 */
export function RepCount({
  reps,
  target,
  unit = 'reps',
  size = 'lg',
  flash = false,
}: {
  reps: number;
  target: number;
  unit?: 'reps' | 'seconds';
  size?: keyof typeof SIZES;
  flash?: boolean;
}) {
  const { numeral, target: denominator } = SIZES[size];
  const digits = `font-sans ${numeral} font-thin leading-none tracking-tighter`;
  return (
    <View
      accessible
      accessibilityLabel={
        Number.isFinite(target) ? `${reps} of ${target} ${unit}` : `${reps} ${unit}`
      }
      className="flex-row items-end gap-1.5"
    >
      <View>
        <Text className={`${digits} text-chalk`}>{reps}</Text>
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: flash ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: flash ? 0 : 600,
          }}
        >
          <Text className={`${digits} text-accent`}>{reps}</Text>
        </Animated.View>
      </View>
      {Number.isFinite(target) && (
        <Text className={`font-sans font-light text-faint ${denominator}`}>/{target}</Text>
      )}
    </View>
  );
}
