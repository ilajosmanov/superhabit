import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

/** Seconds each line stays up. */
const HOLD = 10;
/** Seconds one line takes to fade up and out while the next fades up in. */
const SWAP = 0.45;
/** How far a line rises as it comes and goes, in px. */
const RISE = 14;

const TEXT = 'text-center font-sans text-base leading-normal text-soft';

/**
 * One line's part of the loop of `count` lines: in from below, held for its turn, out above, hidden for
 * the other lines' turns. Outside the component: the React Compiler can't lower computed object keys.
 */
function turnOf(count: number) {
  const loop = count * HOLD;
  const swap = SWAP / loop;
  const turn = HOLD / loop;
  const shown = { opacity: 1, transform: [{ translateY: 0 }] };
  const gone = { opacity: 0, transform: [{ translateY: -RISE }] };
  return Object.fromEntries([
    [0, { opacity: 0, transform: [{ translateY: RISE }] }],
    [swap, shown],
    [turn, shown],
    [turn + swap, gone],
    [1, gone],
  ]);
}

/**
 * Lines shown one at a time, starting from a random one: every 10 s the line rises and fades away as the
 * next rises in from below; after the last comes the first again. Each line plays the same CSS animation
 * on the UI thread, offset by its turn, no timer. It pauses while its tab is hidden (tabs stay mounted)
 * and holds one line when the phone asks for less motion. TalkBack reads the first line shown.
 */
export function RollingLines({ lines }: { lines: readonly string[] }) {
  const still = useReducedMotion();
  const focused = useIsFocused();
  const [first] = useState(() => Math.floor(Math.random() * lines.length));
  const loop = lines.length * HOLD;
  const keyframes = turnOf(lines.length);
  // As tall as the longest line, which sits in the flow unseen; the shown lines lie over it.
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
  return (
    <View accessible accessibilityLabel={lines[first]} className="w-full">
      <Text className={TEXT} style={{ opacity: 0 }}>
        {longest}
      </Text>
      {lines.map((line, i) => {
        // Its place after the first line; the first starts already in, the next comes in as it goes.
        const order = (i - first + lines.length) % lines.length;
        return (
          // A plain Text inside: NativeWind styles core components, the animation is a style.
          <Animated.View
            key={line}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              ...(still
                ? { opacity: order === 0 ? 1 : 0 }
                : {
                    animationName: keyframes,
                    animationDuration: `${loop}s`,
                    animationDelay: `${order * HOLD - SWAP}s`,
                    // Hidden below until its turn comes round the first time.
                    animationFillMode: 'backwards',
                    animationIterationCount: 'infinite',
                    animationTimingFunction: 'ease-in-out',
                    animationPlayState: focused ? 'running' : 'paused',
                  }),
            }}
          >
            <Text className={TEXT}>{line}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}
