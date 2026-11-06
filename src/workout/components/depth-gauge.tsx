import { Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { colors } from '@/theme';

/** 0 (top) … 1 (bottom) on a depth track: 180° (straight) at the top, 30° past `down` at the bottom. */
export function depthAt(angle: number, down: number) {
  'worklet';
  return Math.min(1, Math.max(0, (180 - angle) / (210 - down)));
}

const pct = (x: number): `${number}%` => {
  'worklet';
  return `${x * 100}%`;
};

// A read-only TextInput is the one text view whose content Reanimated can set from the UI thread.
const AnimatedText = Animated.createAnimatedComponent(TextInput);

/**
 * The live depth gauge: fill down to this rep's lowest angle, a tick at `down`, a bar at the current angle,
 * and the angle under it. Per-frame values come only from the shared values, on the UI thread.
 */
export function DepthGauge({
  angle,
  lowest,
  down,
  warn,
  lastDepth,
  track,
}: {
  angle: SharedValue<number | null>;
  lowest: SharedValue<number | null>;
  down: number;
  /** The latest rep was a no-rep: fill in warn. */
  warn: boolean;
  /** The latest rep's depth, for the spoken summary. */
  lastDepth: number | null;
  /** Sizes the track: 'flex-1' to fill a column, or a fixed height. */
  track: string;
}) {
  const fill = useAnimatedStyle(() => {
    const l = lowest.get();
    return { height: pct(l === null ? 0 : depthAt(l, down)) };
  });
  const marker = useAnimatedStyle(() => {
    const a = angle.get();
    return { opacity: a === null ? 0 : 1, top: pct(depthAt(a ?? 180, down)) };
  });
  // `text` is the native prop behind `value`; it is not in TextInputProps.
  const readout = useAnimatedProps<TextInputProps & { text: string }>(() => {
    const a = angle.get();
    return { text: a === null ? '—' : `${Math.round(a)}°` };
  });
  const tick = pct(depthAt(down, down));
  const summary =
    `Depth gauge, deep enough at ${down} degrees.` +
    (lastDepth === null ? '' : ` Last rep reached ${Math.round(lastDepth)} degrees.`);

  return (
    <View accessible accessibilityLabel={summary} className="w-13 items-end gap-2">
      <View className={`w-13 ${track}`}>
        <View className="absolute inset-y-0 right-0.5 w-2 overflow-hidden rounded-full bg-chalk/12">
          <Animated.View
            style={[
              {
                width: '100%',
                borderRadius: 4,
                backgroundColor: warn ? colors.warn : colors.accent,
              },
              fill,
            ]}
          />
        </View>
        <View className="absolute right-0 left-8.5 h-0.5 bg-chalk" style={{ top: tick }} />
        <Text
          className="absolute right-5.5 -mt-2 font-mono text-xs leading-4 text-muted"
          style={{ top: tick }}
        >
          {down}°
        </Text>
        <Animated.View
          style={[
            {
              position: 'absolute',
              right: 0,
              width: 18,
              height: 4,
              marginTop: -2,
              borderRadius: 2,
              backgroundColor: colors.chalk,
            },
            marker,
          ]}
        />
      </View>
      <AnimatedText
        editable={false}
        importantForAccessibility="no"
        defaultValue="—"
        animatedProps={readout}
        style={{
          padding: 0,
          fontFamily: 'Geist Mono',
          fontSize: 13,
          letterSpacing: 0.65,
          textAlign: 'right',
          color: colors.chalk,
        }}
      />
    </View>
  );
}
