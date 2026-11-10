import { Text, View } from 'react-native';

import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import type { Goal } from '@/workout/plan/plan';

/** What a goal asks, read aloud: "30 reps", "120 seconds", "as many as you can". */
export function spokenGoal(goal: Goal, exercise: ExerciseId) {
  if (goal.type === 'max') return maxText(exercise);
  return `${goal.n} ${goal.type === 'seconds' ? 'seconds' : 'reps'}`;
}

const maxText = (exercise: ExerciseId) =>
  EXERCISES[exercise].kind === 'hold' ? 'as long as you can' : 'as many as you can';

const SIZES = {
  // Three digits fit every place this sits: "888" at 128 is ~230 px.
  lg: { numeral: 'text-9xl', max: 'text-6xl', unit: 'text-2xl' },
  md: { numeral: 'text-6xl', max: 'text-4xl', unit: 'text-xl' },
};

/**
 * A goal for reading from across the room: the number in thin numerals and its unit ("120 s": seconds
 * stay seconds, as the catalog writes them), or "Max" and what it asks. The unit wraps under the number
 * when the row is narrow. Hidden from TalkBack: the screen's own label says it. Android's font size
 * leaves it alone: it is 60–128 px already, and scaling it would only push it off the screen.
 */
export function GoalLine({
  goal,
  exercise,
  size = 'lg',
}: {
  goal: Goal;
  exercise: ExerciseId;
  size?: keyof typeof SIZES;
}) {
  const { numeral, max, unit } = SIZES[size];
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      className="shrink flex-row flex-wrap items-end gap-x-2.5"
    >
      <Text
        maxFontSizeMultiplier={1}
        className={`font-sans leading-none text-chalk ${goal.type === 'max' ? `font-light tracking-tight ${max}` : `font-extralight tracking-tighter ${numeral}`}`}
      >
        {goal.type === 'max' ? 'Max' : goal.n}
      </Text>
      <Text maxFontSizeMultiplier={1} className={`pb-1 font-sans font-light text-muted ${unit}`}>
        {goal.type === 'max' ? maxText(exercise) : goal.type === 'seconds' ? 's' : 'reps'}
      </Text>
    </View>
  );
}
