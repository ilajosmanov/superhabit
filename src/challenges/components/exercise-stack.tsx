import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Glyph } from '@/components/glyph';
import { colors } from '@/theme';
import type { CatalogEntry } from '@/challenges/catalog';

const INFO = 'M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18M12 11v5M12 7.5v.5';
// Five tiles and a "+N" tile fit one line on the narrowest card.
const MAX_TILES = 5;

/** What you do each day, in full: one line per step with its goal in its own unit, then rounds and rest. */
export function StepLines({ entry }: { entry: CatalogEntry }) {
  return (
    <View className="gap-3.5">
      <View className="gap-2.5">
        {entry.steps.map((step, i) => (
          // A challenge may repeat an exercise, so the index is part of the key.
          <View key={`${i}-${step.name}`} className="flex-row items-center gap-2.5">
            <Glyph d={step.glyph} size={20} box={32} />
            <Text className="font-sans text-base text-soft">{step.name}</Text>
            <Text className="font-mono text-xs text-muted">{step.goal}</Text>
          </View>
        ))}
      </View>
      {entry.note && (
        <Text className="font-mono text-xs tracking-widest text-muted">{entry.note}</Text>
      )}
    </View>
  );
}

/** The (i) beside a challenge's name: opens its full steps in a sheet. */
export function StepsButton({ entry }: { entry: CatalogEntry }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`All steps of ${entry.name}`}
      hitSlop={12}
      onPress={() => router.push({ pathname: '/steps/[id]', params: { id: entry.id } })}
    >
      <Glyph d={INFO} size={18} color={colors.muted} />
    </Pressable>
  );
}

/**
 * Always one line, however long the challenge: the exercises as overlapping hairline tiles, like an
 * avatar stack. Each tile is filled with the card's surface colour, so it cuts cleanly into the next.
 */
export function ExerciseStack({ entry }: { entry: CatalogEntry }) {
  const exercises = [...new Map(entry.steps.map((step) => [step.name, step])).values()];
  // A lone "+1" tile is no shorter than the tile it hides.
  const shown = exercises.length > MAX_TILES + 1 ? exercises.slice(0, MAX_TILES) : exercises;
  const extra = exercises.length - shown.length;
  const tile = 'size-9 items-center justify-center rounded-lg border border-edge bg-surface';

  return (
    <View
      accessible
      accessibilityLabel={exercises.map((step) => step.name).join(', ')}
      className="flex-row"
    >
      {shown.map((step, i) => (
        <View
          key={step.name}
          className={`${tile} ${i > 0 ? '-ml-2' : ''}`}
          // Earlier tiles sit on top, like a hand of cards.
          style={{ zIndex: shown.length - i }}
        >
          <Glyph d={step.glyph} size={22} box={32} />
        </View>
      ))}
      {extra > 0 && (
        <View className={`${tile} -ml-2`}>
          <Text className="font-mono text-xs text-muted">+{extra}</Text>
        </View>
      )}
    </View>
  );
}
