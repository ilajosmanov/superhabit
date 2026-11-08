import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { SwipeRow } from './swipe-row';
import { capitalise } from '@/challenges/challenges';
import { IconButton } from '@/components/icon-button';
import { ExerciseFigure, ExerciseMotion, moves } from '@/components/illustrations';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { colors } from '@/theme';

const CARD = 256;

/**
 * One card per exercise: the figure, which plays one rep on a loop when asked, then the
 * rep in steps, start position first. One exercise fills the row; several swipe.
 */
export function HowItCounts({ exercises }: { exercises: readonly ExerciseId[] }) {
  const { width } = useWindowDimensions();
  const one = exercises.length === 1;
  const cards = exercises.map((id) => (
    <Card key={id} exercise={id} width={one ? width - 48 : CARD} />
  ));
  return (
    <View className="gap-3">
      <Text className="font-mono text-xs tracking-widest text-muted">HOW IT COUNTS</Text>
      {one ? cards : <SwipeRow itemWidth={CARD}>{cards}</SwipeRow>}
    </View>
  );
}

function Card({ exercise, width }: { exercise: ExerciseId; width: number }) {
  const { name, ready, how } = EXERCISES[exercise];
  const steps = [ready, ...how];
  const [play, setPlay] = useState(false);
  // Stops once another screen covers this one. Popping is too late: see `ExerciseMotion`.
  const focused = useIsFocused();
  const playing = play && focused;
  const figure = { exercise, size: 104, weight: 0.9 };
  return (
    <View style={{ width }} className="gap-3.5 rounded-3xl border border-line bg-surface p-3 pb-5">
      <View className="h-28 items-center justify-center rounded-2xl bg-ground">
        {playing ? <ExerciseMotion {...figure} /> : <ExerciseFigure {...figure} />}
        {moves(exercise) && (
          <IconButton
            icon={playing ? 'pause' : 'play_arrow'}
            label={`Show a ${name} rep`}
            checked={playing}
            size={20}
            color={colors.muted}
            onPress={() => setPlay(!playing)}
            style={{ position: 'absolute', right: 0, bottom: 0 }}
          />
        )}
      </View>
      <View
        accessible
        accessibilityLabel={`How ${name} count: ${steps.join('. ')}`}
        className="gap-3 px-1"
      >
        <Text className="font-sans text-lg tracking-tight text-chalk">{capitalise(name)}</Text>
        <View className="gap-1.5">
          {steps.map((step, i) => (
            <View key={step} className="flex-row gap-2.5">
              <Text className="w-4 pt-0.5 font-mono text-xs text-muted">{`0${i + 1}`}</Text>
              <Text className="flex-1 font-sans text-sm leading-snug text-soft">{step}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
