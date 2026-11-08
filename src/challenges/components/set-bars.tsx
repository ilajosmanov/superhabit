import { Text, View } from 'react-native';

import { capitalise } from '@/challenges/challenges';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { goalLabel, type Goal } from '@/workout/plan';

/**
 * One bar per set, widths shared by the headline's unit, each labelled with its exercise and goal.
 * The bars fill amber by the latest try's share, together, like that day's square on the card.
 */
// shortcut: a day stores one share, not per-set results, so a partial try fills every bar alike; store
// each set's amount in `Progress` if per-set bars are wanted.
export function SetBars({
  sets,
  finite,
  countsReps,
  share,
}: {
  sets: readonly { exercise: ExerciseId; goal: Goal }[];
  finite: boolean;
  countsReps: boolean;
  share: number;
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
          <View className="h-1.5 overflow-hidden rounded-full bg-faint">
            <View className="h-full bg-accent" style={{ width: `${Math.round(share * 100)}%` }} />
          </View>
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
