import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Sheet } from './sheet';
import { isHold } from '@/challenges/hold';
import { ONE_GO } from '@/challenges/one-go';
import { ExerciseFigure } from '@/components/illustrations';
import { PrimaryButton } from '@/components/primary-button';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { capitalise } from '@/lib/text';

/**
 * What the surprise card picked, before the camera opens: the exercise, what counts, where the phone
 * goes, and Start.
 */
function SurpriseSheet({
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
            <ExerciseFigure exercise={id} size={36} />
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
        {isHold(id)
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

/**
 * A random one-go exercise: `pick()` draws one and opens the sheet, and Start opens the camera on it.
 * Render `sheet` where the button is.
 */
export function useSurprise() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Kept after closing, so the sheet still shows it while it slides away.
  const [picked, setPicked] = useState<ExerciseId>(ONE_GO[0]);
  return {
    pick: () => {
      setPicked(ONE_GO[Math.floor(Math.random() * ONE_GO.length)]);
      setOpen(true);
    },
    sheet: (
      <SurpriseSheet
        open={open}
        exercise={picked}
        onDismiss={() => setOpen(false)}
        onStart={() => {
          // A second tap while the sheet slides away would open a second camera.
          if (!open) return;
          setOpen(false);
          router.push({ pathname: '/workout/[id]', params: { id: picked } });
        }}
      />
    ),
  };
}
