import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ExerciseTile } from '@/components/exercise-tile';
import { ARROW_RIGHT, Glyph } from '@/components/glyph';
import { Screen } from '@/components/screen';
import { EXERCISES } from '@/exercises/registry';
import { colors } from '@/theme';
import { CHALLENGES, summary, totalReps } from '@/workout/challenges';

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What a challenge asks for and how to set up the phone, then Start opens the camera run. */
export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challenge = CHALLENGES.get(id);
  if (!challenge) return <Screen title="Not found" />;

  const reps = totalReps(challenge);
  const orientations = new Set(challenge.sets.map((set) => EXERCISES[set.exercise].orientation));
  const phone =
    orientations.size > 1 ? 'Rotates' : orientations.has('landscape') ? 'Sideways' : 'Upright';
  // The run explains each later set's setup between sets; the first one is explained here.
  const first = EXERCISES[challenge.sets[0].exercise];

  return (
    <Screen
      title={challenge.name}
      intro={`${summary(challenge)}. The camera counts, and only full-range reps score.`}
      footer={
        <Link href={{ pathname: '/workout/[id]', params: { id } }} asChild>
          <Pressable
            accessibilityRole="button"
            className="h-14 flex-row items-center justify-between rounded-full bg-accent px-6 active:opacity-80"
          >
            <Text className="font-sans text-base font-medium text-ground">Start</Text>
            <Glyph d={ARROW_RIGHT} size={20} color={colors.ground} />
          </Pressable>
        </Link>
      }
    >
      <View className="flex-row">
        <Stat label="SETS" value={String(challenge.sets.length)} />
        <Stat label="REPS" value={Number.isFinite(reps) ? String(reps) : 'Max'} />
        <Stat label="PHONE" value={phone} />
      </View>

      <View accessibilityLabel="Sets" className="-mt-4">
        {challenge.sets.map(({ exercise, reps }, i) => (
          <View
            // A challenge may repeat an exercise, so the index is part of the key.
            key={`${i}-${exercise}`}
            className="flex-row items-center gap-4 border-b border-line py-4"
          >
            <ExerciseTile id={exercise} />
            <View className="flex-1 gap-1">
              <Text className="font-sans text-lg text-chalk">
                {capitalise(EXERCISES[exercise].name)}
              </Text>
              <Text className="font-sans text-sm text-muted">{EXERCISES[exercise].hint}</Text>
            </View>
            <Text className="font-mono text-base text-chalk">
              {Number.isFinite(reps) ? `×${reps}` : 'MAX'}
            </Text>
          </View>
        ))}
      </View>

      <View className="gap-4">
        <Text className="font-mono text-xs tracking-widest text-muted">BEFORE YOU START</Text>
        <Text className="font-sans text-2xl font-light text-chalk">{first.place}</Text>
        <View className="gap-2.5">
          {first.steps.map((step, i) => (
            <View key={step} className="flex-row gap-3">
              <Text className="w-5 pt-0.5 font-mono text-xs text-muted">{`0${i + 1}`}</Text>
              <Text className="flex-1 font-sans text-base text-soft">{step}</Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-1">
      <Text className="font-mono text-xs tracking-wider text-muted">{label}</Text>
      <Text className="font-sans text-xl font-light text-chalk">{value}</Text>
    </View>
  );
}
