import { Text, View } from 'react-native';

import { Sheet } from './sheet';
import { capitalise } from '@/challenges/challenges';
import { Glyph } from '@/components/glyph';
import { PrimaryButton } from '@/components/primary-button';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';

/**
 * What the surprise card picked, before the camera opens: the exercise, what counts, where the phone
 * goes, and Start.
 */
export function SurpriseSheet({
  open,
  exercise: id,
  onDismiss,
  onStart,
}: {
  open: boolean;
  exercise: ExerciseId;
  onDismiss: () => void;
  onStart: () => void;
}) {
  const exercise = EXERCISES[id];
  return (
    <Sheet open={open} onDismiss={onDismiss}>
      <View className="gap-4">
        <Text className="font-mono text-xs tracking-widest text-muted">SURPRISE · ONE GO</Text>
        <View className="flex-row items-center gap-4">
          <View className="size-16 items-center justify-center rounded-2xl border border-edge bg-ground">
            <Glyph d={exercise.glyph} size={36} box={32} />
          </View>
          <Text
            accessibilityRole="header"
            className="flex-1 font-sans text-4xl font-light tracking-tight text-chalk"
          >
            {capitalise(exercise.name)}
          </Text>
        </View>
      </View>

      <Text className="font-sans text-base leading-normal text-soft">
        {exercise.kind === 'hold'
          ? 'One hold, as long as you can. The camera times it.'
          : 'One set, as many clean reps as you can. The camera counts them.'}{' '}
        Just this once: nothing to keep up tomorrow.
      </Text>

      <Text className="font-mono text-xs tracking-widest text-muted">
        {exercise.place.toUpperCase()}
      </Text>

      <PrimaryButton
        label="Start"
        accessibilityLabel={`Start ${exercise.name}`}
        onPress={onStart}
      />
    </Sheet>
  );
}
