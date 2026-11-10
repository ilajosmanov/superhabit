import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { ExerciseStack } from './exercise-stack';
import { useSurprise } from './surprise-sheet';
import { ONE_GO } from '@/challenges/challenges';
import { DieFigure } from '@/components/illustrations';
import { EXERCISES } from '@/exercises/registry';
import { capitalise } from '@/lib/text';
import { colors, lit } from '@/theme';

const EVERY = ONE_GO.map((id) => ({
  exercise: id,
  name: capitalise(EXERCISES[id].name),
}));

/**
 * One random exercise, once, as many as you can; a sheet says which before the camera opens. The last
 * card of the YOURS row, or the whole row when nothing is joined. Outlined, not filled: it isn't yours.
 * `style` sets the width inside the swipe row.
 */
export function SurpriseCard({ style }: { style?: ViewStyle }) {
  const surprise = useSurprise();
  return (
    // The wrapper clips the ripple to the card's corners.
    <View
      className="overflow-hidden rounded-3xl border border-line"
      style={[
        {
          backgroundImage: `radial-gradient(ellipse at 85% 15%, ${colors.surface} 0%, ${colors.ground} 70%)`,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Surprise me: a random exercise, once"
        android_ripple={{ color: colors.line }}
        onPress={surprise.pick}
        // grow, not flex-1: alone the card sizes to its content; in the row it stretches to the tallest card.
        className="grow gap-5 p-5"
      >
        <View className="flex-row justify-between">
          <Text className="font-mono text-xs tracking-widest text-muted">SURPRISE ME</Text>
          <Text className="font-mono text-xs tracking-widest text-muted">ONE GO</Text>
        </View>

        <View className="grow flex-row items-end justify-between gap-3">
          <Text className="font-sans text-3xl font-light leading-none tracking-tight text-chalk">
            A random set,{'\n'}right now
          </Text>
          <DieFigure size={88} weight={0.7} />
        </View>

        {/* Always five tiles and a count, however many exercises there are. */}
        <View className="flex-row items-center justify-between border-t border-line pt-4">
          <ExerciseStack steps={EVERY} />
          <View className="h-11 justify-center rounded-full bg-accent px-6" style={lit}>
            <Text className="font-sans text-base font-semibold tracking-tight text-ground">
              Start
            </Text>
          </View>
        </View>
      </Pressable>
      {surprise.sheet}
    </View>
  );
}
