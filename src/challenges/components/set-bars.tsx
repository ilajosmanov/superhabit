import { Text, View } from 'react-native';

import { capitalise } from '@/challenges/challenges';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { colors } from '@/theme';
import { goalLabel, type Goal } from '@/workout/plan';

/**
 * One bar per set, widths shared by the headline's unit, each labelled with its exercise and goal.
 * The bars fill amber once today's session is done; a day is done or not, so they fill together.
 */
export function SetBars({
  sets,
  finite,
  countsReps,
  done,
}: {
  sets: readonly { exercise: ExerciseId; goal: Goal }[];
  finite: boolean;
  countsReps: boolean;
  done: boolean;
}) {
  return (
    <View className="flex-row flex-wrap gap-x-1.5 gap-y-4">
      {sets.map(({ exercise, goal }, i) => (
        <View
          // A challenge may repeat an exercise, so the index is part of the key.
          key={`${i}-${exercise}`}
          // Bars share the width by the headline's unit; open-ended sets go equal.
          style={{
            flex:
              finite && goal.type === (countsReps ? 'reps' : 'seconds') && 'n' in goal ? goal.n : 1,
          }}
          className="min-w-18 gap-3"
        >
          {/* Colour in style: a swapped class remounts the view. */}
          <View
            className="h-1.5 rounded-full"
            style={{ backgroundColor: done ? colors.accent : colors.faint }}
          />
          <View className="gap-1">
            <View className="flex-row items-center gap-1.5">
              <ExerciseFigure exercise={exercise} size={20} />
              <Text numberOfLines={1} className="shrink font-sans text-sm text-chalk">
                {capitalise(EXERCISES[exercise].name)}
              </Text>
            </View>
            <Text className="font-mono text-xs text-muted">{goalLabel(goal)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
