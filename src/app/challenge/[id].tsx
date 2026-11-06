import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Glyph } from '@/components/glyph';
import { PhoneSetup } from '@/workout/components/phone-setup';
import { Screen } from '@/components/screen';
import { EXERCISES } from '@/exercises/registry';
import { colors, lit } from '@/theme';
import { capitalise, CHALLENGES, detail, summary } from '@/workout/challenges';
import { goalLabel } from '@/workout/plan';

const HOLD_MS = 700;

/**
 * Starting opens the camera run, so it takes a deliberate press and hold; the pill fills as you hold.
 * Lit from above (lighter top, darker lip) so it reads as a physical key, not a flat shape.
 */
function HoldToStart({ onStart }: { onStart: () => void }) {
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
        accessibilityLabel="Start"
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
          Hold to start
        </Text>
      </Pressable>
    </View>
  );
}

/** What a challenge asks for and how to set up the phone, then Start opens the camera run. */
export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const challenge = CHALLENGES.get(id);
  if (!challenge) return <Screen title="Not found" />;

  const { sets, total, countsReps, tracking, phone, first } = detail(challenge);
  const finite = Number.isFinite(total);

  return (
    <Screen
      title={challenge.name}
      footer={
        <HoldToStart onStart={() => router.push({ pathname: '/workout/[id]', params: { id } })} />
      }
    >
      <Text className="-mt-5 font-mono text-xs tracking-widest text-muted">
        {sets.length} {sets.length === 1 ? 'SET' : 'SETS'} · PHONE {phone}
      </Text>

      <View accessible accessibilityLabel={`${summary(challenge)}. ${tracking}`} className="gap-6">
        {/* Clipped so the numeral rises out of its baseline, like the podium steps. */}
        <View className="flex-row items-end justify-between overflow-hidden">
          <Animated.View entering={FadeInDown.duration(500)}>
            <Text className="-ml-1.5 font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk">
              {finite ? total : 'Max'}
            </Text>
          </Animated.View>
          <Text className="pb-4 font-mono text-xs tracking-widest text-muted">
            {countsReps ? 'CLEAN REPS' : 'SECONDS'}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-x-1.5 gap-y-4">
          {sets.map(({ exercise, goal }, i) => (
            <View
              // A challenge may repeat an exercise, so the index is part of the key.
              key={`${i}-${exercise}`}
              // Bars share the width by the headline's unit; open-ended sets go equal.
              style={{
                flex:
                  finite && goal.type === (countsReps ? 'reps' : 'seconds') && 'n' in goal
                    ? goal.n
                    : 1,
              }}
              className="min-w-18 gap-3"
            >
              <View className="h-1.5 rounded-full bg-faint" />
              <View className="gap-1">
                <View className="flex-row items-center gap-1.5">
                  <Glyph d={EXERCISES[exercise].glyph} size={20} box={32} />
                  <Text numberOfLines={1} className="shrink font-sans text-sm text-chalk">
                    {capitalise(EXERCISES[exercise].name)}
                  </Text>
                </View>
                <Text className="font-mono text-xs text-muted">{goalLabel(goal)}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text className="font-sans text-sm text-muted">{tracking}</Text>
      </View>

      <View className="gap-4">
        <Text className="font-mono text-xs tracking-widest text-muted">BEFORE YOU START</Text>
        <PhoneSetup exercise={first} />
      </View>
    </Screen>
  );
}
