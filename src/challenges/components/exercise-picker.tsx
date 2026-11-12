import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { isHold } from '@/challenges/hold';
import { ONE_GO } from '@/challenges/one-go';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES, orientation } from '@/exercises/registry';
import { capitalise } from '@/lib/text';
import { useColors } from '@/components/colors';

/** One row per exercise the camera counts, hairline-divided; a row opens the builder. */
export function ExercisePicker() {
  const colors = useColors();
  return (
    <View className="gap-1">
      <Text className="font-mono text-xs tracking-widest text-muted">PICK AN EXERCISE</Text>
      <View>
        {ONE_GO.map((id) => {
          const { name, placement } = EXERCISES[id];
          const way = orientation(placement) === 'landscape' ? 'SIDEWAYS' : 'UPRIGHT';
          const detail = `${isHold(id) ? 'SECONDS' : 'REPS'} · PHONE ${way}`;
          return (
            <Link key={id} href={{ pathname: '/build', params: { exercise: id } }} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${name}, ${detail.toLowerCase()}`}
                android_ripple={{ color: colors.surface }}
                className="flex-row items-center gap-4 border-b border-line py-3"
              >
                <View className="size-11 items-center justify-center rounded-xl border border-line">
                  <ExerciseFigure exercise={id} size={24} />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="font-sans text-lg tracking-tight text-chalk">
                    {capitalise(name)}
                  </Text>
                  <Text className="font-mono text-xs tracking-wide text-muted">{detail}</Text>
                </View>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}
