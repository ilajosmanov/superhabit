import { View } from 'react-native';

import { Glyph } from '@/components/glyph';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';

/** The exercise's line icon in a 44px hairline tile; used on every exercise and challenge row. */
export function ExerciseTile({ id }: { id: ExerciseId }) {
  return (
    <View className="size-11 items-center justify-center rounded-xl border border-line">
      <Glyph d={EXERCISES[id].glyph} size={28} box={32} />
    </View>
  );
}
