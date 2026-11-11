import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { ExerciseMotion } from './illustrations';

/** A figure doing reps on repeat, with a line under it, while something loads. */
export function Waiting({
  exercise,
  text,
}: {
  exercise: ComponentProps<typeof ExerciseMotion>['exercise'];
  text: string;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-6 bg-ground px-6">
      <ExerciseMotion exercise={exercise} size={160} weight={0.9} />
      <Text className="text-center font-sans text-base leading-normal text-soft">{text}</Text>
    </View>
  );
}
