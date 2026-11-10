import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Sheet } from './sheet';
import { capitalise, ONE_GO } from '@/challenges/challenges';
import { IconButton } from '@/components/icon-button';
import { DieFigure, ExerciseFigure } from '@/components/illustrations';
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
          setOpen(false);
          router.push({ pathname: '/workout/[id]', params: { id: picked } });
        }}
      />
    ),
  };
}

// One quick turn (0.6 s), then still for the rest of each 5 s.
const ROLL = {
  '0%': { transform: [{ rotate: '0deg' }] },
  '12%': { transform: [{ rotate: '360deg' }] },
  '100%': { transform: [{ rotate: '360deg' }] },
};

/**
 * The surprise card's die as an icon button that opens a random set (`onPress`: a `useSurprise` pick),
 * rolling now and then: a full turn of the cube lands on the same outline, so it reads as a tumble. Only
 * the die turns, around its centre. The roll pauses while its tab is hidden (tabs stay mounted) and stays
 * still when the phone asks for less motion.
 */
export function SurpriseButton({ onPress, style }: { onPress: () => void; style?: ViewStyle }) {
  const still = useReducedMotion();
  const focused = useIsFocused();
  return (
    <IconButton
      label="Do a random set"
      onPress={onPress}
      style={style}
      figure={
        <Animated.View
          style={{
            animationName: still ? 'none' : ROLL,
            animationDuration: '5s',
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-in-out',
            animationPlayState: focused ? 'running' : 'paused',
          }}
        >
          {/* About the 1.5px line of the symbols at this size. */}
          <DieFigure size={28} weight={1.7} />
        </Animated.View>
      }
    />
  );
}
