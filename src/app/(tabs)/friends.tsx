import { useIsFocused } from 'expo-router';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { colors } from '@/theme';

// Reanimated CSS animations run on the UI thread with no effect or timer in the screen.
const SWEEP = {
  from: { transform: [{ translateX: '-100%' }] },
  to: { transform: [{ translateX: '100%' }] },
};
const PULSE = {
  from: { transform: [{ scale: 1 }], opacity: 0.6 },
  to: { transform: [{ scale: 2.6 }], opacity: 0 },
};

/** A skeleton placeholder with a slow light sweep; `delay` staggers neighbours. */
function Bone({ className, delay = 0 }: { className: string; delay?: number }) {
  const still = useReducedMotion();
  return (
    <View aria-hidden className={`overflow-hidden bg-surface ${className}`}>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: '100%',
          opacity: 0.7,
          backgroundImage: `linear-gradient(90deg, transparent, ${colors.edge}, transparent)`,
          animationName: still ? 'none' : SWEEP,
          animationDuration: '2.8s',
          animationDelay: `${delay}ms`,
          animationIterationCount: 'infinite',
          animationTimingFunction: 'ease-in-out',
        }}
      />
    </View>
  );
}

function Step({
  place,
  avatar,
  name,
  block,
  numeral,
  first = false,
  delay,
}: {
  place: number;
  avatar: string;
  name: string;
  block: string;
  numeral: string;
  first?: boolean;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(delay)}
      style={{ flex: 1, alignItems: 'center', gap: 10 }}
    >
      {first ? (
        <View className="size-12 items-center justify-center rounded-full border border-edge">
          <Bone className="size-9 rounded-full" delay={delay} />
        </View>
      ) : (
        <Bone className={`${avatar} rounded-full border border-line`} delay={delay} />
      )}
      <Bone className={`${name} h-2 rounded`} delay={delay} />
      <View
        className={`${block} items-center self-stretch rounded-t-xl border border-b-0 pt-2.5 ${first ? 'border-edge bg-surface' : 'border-line bg-ground'}`}
      >
        <Text
          className={`font-sans ${numeral} font-extralight leading-none tracking-tighter ${first ? 'text-muted' : 'text-faint'}`}
        >
          {place}
        </Text>
      </View>
    </Animated.View>
  );
}

function GhostRow({
  rank,
  name,
  delay,
  dim = false,
}: {
  rank: number;
  name: string;
  delay: number;
  dim?: boolean;
}) {
  return (
    <View aria-hidden className={`h-13 flex-row items-center gap-4 ${dim ? 'opacity-45' : ''}`}>
      <Text className="w-6 font-sans text-xl font-extralight text-faint">{rank}</Text>
      <Bone className="size-8 rounded-full" delay={delay} />
      <View className="flex-1 gap-1.5">
        <Bone className={`${name} h-2.5 rounded-full`} delay={delay} />
        <Bone className="h-2 w-12 rounded-full" delay={delay} />
      </View>
      <Bone className="h-2.5 w-8 rounded-full" delay={delay} />
    </View>
  );
}

/** The leaderboard isn't built yet: a ghost podium and skeleton rows tease it. */
export default function FriendsScreen() {
  const still = useReducedMotion();
  const focused = useIsFocused();

  return (
    <Screen
      label="FRIENDS"
      title="Leaderboard"
      intro="Rank against friends on clean reps only. The camera keeps everyone honest."
    >
      <View className="-mt-4 h-7 flex-row items-center gap-2 self-start rounded-full border border-line px-3">
        <View className="size-1.5">
          {!still && (
            <Animated.View
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 9999,
                backgroundColor: colors.accent,
                animationName: PULSE,
                animationDuration: '2.4s',
                animationIterationCount: 'infinite',
                animationTimingFunction: 'ease-out',
              }}
            />
          )}
          <View className="size-1.5 rounded-full bg-accent" />
        </View>
        <Text className="font-mono text-xs tracking-widest text-muted">COMING SOON</Text>
      </View>

      <View>
        <View
          // Native tabs mount every tab at launch, so remount on focus to replay the rise.
          // Focus lands a few frames after the tab shows: stay hidden until then, or the
          // finished podium flashes before the rise restarts.
          key={String(focused)}
          accessible
          accessibilityLabel="Preview of the podium: first, second and third place"
          // Clipped so the steps rise out of the floor line, not up through the rows below.
          className={`flex-row items-end gap-3 overflow-hidden ${focused ? '' : 'opacity-0'}`}
        >
          <Step
            place={2}
            avatar="size-10"
            name="w-12"
            block="h-24"
            numeral="text-6xl"
            delay={100}
          />
          <Step
            place={1}
            avatar="size-12"
            name="w-14"
            block="h-32"
            numeral="text-7xl"
            first
            delay={0}
          />
          <Step
            place={3}
            avatar="size-10"
            name="w-10"
            block="h-20"
            numeral="text-5xl"
            delay={200}
          />
        </View>

        <View className="border-t border-line">
          <GhostRow rank={4} name="w-24" delay={450} />
          <View
            accessible
            accessibilityLabel="You. Your rank lands here"
            className="-mx-3 h-13 flex-row items-center gap-4 rounded-xl bg-surface px-3"
          >
            <Text className="w-6 font-sans text-xl font-extralight text-accent">–</Text>
            <View className="size-8 items-center justify-center rounded-full border border-accent">
              <Text className="font-sans text-xs font-medium text-chalk">You</Text>
            </View>
            <View className="flex-1 gap-1">
              <Text className="font-sans text-base text-chalk">You</Text>
              <Text className="font-sans text-xs text-muted">Your rank lands here</Text>
            </View>
            <Text className="font-mono text-sm text-muted">—</Text>
          </View>
          <GhostRow rank={6} name="w-18" delay={600} dim />
        </View>
      </View>
    </Screen>
  );
}
