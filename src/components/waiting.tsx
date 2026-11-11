import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { ExerciseFigure, ExerciseMotion } from './illustrations';

/** A figure doing reps on repeat, with a line under it, while something loads; still under reduced motion. */
export function Waiting({
  exercise,
  text,
}: {
  exercise: ComponentProps<typeof ExerciseMotion>['exercise'];
  text: string;
}) {
  const Figure = useReducedMotion() ? ExerciseFigure : ExerciseMotion;
  return (
    <View className="flex-1 items-center justify-center gap-6 bg-ground px-6">
      <Figure exercise={exercise} size={160} weight={0.9} />
      <Text className="text-center font-sans text-base leading-normal text-soft">{text}</Text>
    </View>
  );
}
