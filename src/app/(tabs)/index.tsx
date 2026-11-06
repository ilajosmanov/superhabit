import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ExerciseTile } from '@/workout/components/exercise-tile';
import { ARROW_RIGHT, Glyph } from '@/components/glyph';
import { Screen } from '@/components/screen';
import { colors } from '@/theme';
import { CHALLENGES, summary, totalReps, type Challenge } from '@/workout/challenges';

const repsLabel = (challenge: Challenge) => {
  const reps = totalReps(challenge);
  return Number.isFinite(reps) ? `${reps} REPS` : 'NO LIMIT';
};

export default function ChallengesScreen() {
  const [featured, ...challenges] = [...CHALLENGES];

  return (
    <Screen label="SUPERHABIT" title="Challenges">
      {featured && <FeaturedCard id={featured[0]} challenge={featured[1]} />}

      <View className="-mt-4">
        {challenges.map(([id, challenge]) => (
          <Link key={id} href={{ pathname: '/challenge/[id]', params: { id } }} asChild>
            <Pressable
              accessibilityRole="link"
              android_ripple={{ color: colors.surface }}
              className="-mx-6 px-6"
            >
              <View className="flex-row items-center gap-4 border-b border-line py-4">
                <ExerciseTile id={challenge.sets[0].exercise} />
                <View className="flex-1 gap-1">
                  <Text className="font-sans text-lg text-chalk">{challenge.name}</Text>
                  <Text className="font-sans text-sm text-muted">{summary(challenge)}</Text>
                </View>
                <Text className="font-mono text-xs tracking-wider text-muted">
                  {repsLabel(challenge)}
                </Text>
              </View>
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}

function FeaturedCard({ id, challenge }: { id: string; challenge: Challenge }) {
  const exercises = [...new Set(challenge.sets.map((set) => set.exercise))];
  return (
    // The wrapper clips the ripple to the card's corners.
    <View className="overflow-hidden rounded-3xl bg-surface">
      <Link href={{ pathname: '/challenge/[id]', params: { id } }} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Featured: ${challenge.name}. ${summary(challenge)}`}
          android_ripple={{ color: colors.line }}
          className="gap-4 p-5"
        >
          <Text className="font-mono text-xs tracking-widest text-muted">
            FEATURED · {challenge.sets.length} {challenge.sets.length === 1 ? 'SET' : 'SETS'}
          </Text>
          <View className="flex-row items-center gap-4">
            <Text className="flex-1 font-sans text-3xl font-light tracking-tight text-chalk">
              {challenge.name}
            </Text>
            <Glyph d={ARROW_RIGHT} size={20} />
          </View>
          <Text className="font-sans text-base text-soft">{summary(challenge)}</Text>
          <View className="flex-row items-center gap-2 border-t border-line pt-4">
            {exercises.map((exercise) => (
              <ExerciseTile key={exercise} id={exercise} />
            ))}
            <Text className="ml-auto font-mono text-xs tracking-wider text-muted">
              {repsLabel(challenge)}
            </Text>
          </View>
        </Pressable>
      </Link>
    </View>
  );
}
