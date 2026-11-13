import { Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { dark as colors } from '@/theme';

import { depthAt, depthText, type Gauge } from '@/lib/depth';

const pct = (x: number): `${number}%` => {
  'worklet';
  return `${x * 100}%`;
};

// A read-only TextInput is the one text view whose content Reanimated can set from the UI thread.
const AnimatedText = Animated.createAnimatedComponent(TextInput);

/**
 * The live depth gauge: fill down to this rep's deepest value, a tick at `gauge.down`, a bar at the
 * current value, and the value under it. Per-frame values come only from the shared values, on the UI thread.
 */
export function DepthGauge({
  angle,
  lowest,
  gauge,
  warn,
  lastDepth,
  track,
}: {
  angle: SharedValue<number | null>;
  lowest: SharedValue<number | null>;
  gauge: Gauge;
  /** The latest rep was a no-rep: fill in warn. */
  warn: boolean;
  /** The latest rep's depth, for the spoken summary. */
  lastDepth: number | null;
  /** Sizes the track: 'flex-1' to fill a column, or a fixed height. */
  track: string;
}) {
  const fill = useAnimatedStyle(() => {
    const l = lowest.get();
    return { height: pct(l === null ? 0 : depthAt(l, gauge)) };
  });
  const marker = useAnimatedStyle(() => {
    const a = angle.get();
    return { opacity: a === null ? 0 : 1, top: pct(depthAt(a ?? gauge.up, gauge)) };
  });
  // `text` is the native prop behind `value`; it is not in TextInputProps.
  const readout = useAnimatedProps<TextInputProps & { text: string }>(() => {
    const a = angle.get();
    return { text: a === null ? '—' : depthText(a) };
  });
  const tick = pct(depthAt(gauge.down, gauge));
  const summary =
    `Depth gauge, deep enough at ${depthText(gauge.down)}.` +
    (lastDepth === null ? '' : ` Last rep reached ${depthText(lastDepth)}.`);

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
          {depthText(gauge.down)}
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
