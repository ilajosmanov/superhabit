import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { capitalise, ONE_GO, phoneWay } from '@/challenges/challenges';
import { Glyph } from '@/components/glyph';
import { EXERCISES } from '@/exercises/registry';
import { colors } from '@/theme';

/** One row per exercise the camera counts, hairline-divided like Today; a row opens the builder. */
export function ExercisePicker() {
  return (
    <View className="gap-1">
      <Text className="font-mono text-xs tracking-widest text-muted">PICK AN EXERCISE</Text>
      <View>
        {ONE_GO.map((id) => {
          const { name, kind, glyph, placement } = EXERCISES[id];
          const detail = `${kind === 'hold' ? 'SECONDS' : 'REPS'} · PHONE ${phoneWay(placement)}`;
          return (
            <Link key={id} href={{ pathname: '/build', params: { exercise: id } }} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${name}, ${detail.toLowerCase()}`}
                android_ripple={{ color: colors.surface }}
                className="flex-row items-center gap-4 border-b border-line py-3"
              >
                <View className="size-11 items-center justify-center rounded-xl border border-line">
                  <Glyph d={glyph} size={24} box={32} />
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
