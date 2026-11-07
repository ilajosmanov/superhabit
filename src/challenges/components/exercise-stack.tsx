import { useState } from 'react';
import { Text, View } from 'react-native';

import { Sheet } from './sheet';
import { IconButton } from '@/components/icon-button';
import { ExerciseFigure } from '@/components/illustrations';
import { colors } from '@/theme';
import type { CatalogEntry, CatalogStep } from '@/challenges/catalog';

// Five tiles and a "+N" tile fit one line on the narrowest card.
const MAX_TILES = 5;

/** What you do each day, in full: one line per step with its goal in its own unit, then rounds and rest. */
function StepLines({ entry }: { entry: CatalogEntry }) {
  return (
    <View className="gap-3.5">
      <View className="gap-2.5">
        {entry.steps.map((step, i) => (
          // A challenge may repeat an exercise, so the index is part of the key.
          <View key={`${i}-${step.name}`} className="flex-row items-center gap-2.5">
            <ExerciseFigure exercise={step.exercise} size={20} />
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

/** The (i) beside a challenge's name: its full day in the platform sheet, like the surprise card's. */
export function StepsButton({ entry }: { entry: CatalogEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Pulled into the card's padding so the 48dp target doesn't grow the row. */}
      <IconButton
        icon="info"
        label={`All steps of ${entry.name}`}
        size={20}
        color={colors.muted}
        onPress={() => setOpen(true)}
        style={{ marginVertical: -6, marginRight: -12 }}
      />
      <Sheet open={open} onDismiss={() => setOpen(false)}>
        <View className="gap-2">
          <Text className="font-mono text-xs tracking-widest text-muted">
            EVERY DAY · {entry.days} DAYS
          </Text>
          <Text
            accessibilityRole="header"
            className="font-sans text-3xl font-light tracking-tight text-chalk"
          >
            {entry.name}
          </Text>
        </View>
        <StepLines entry={entry} />
      </Sheet>
    </>
  );
}

/**
 * Always one line, however long the challenge: the exercises as overlapping hairline tiles, like an
 * avatar stack. Each tile is filled with the card's surface colour, so it cuts cleanly into the next.
 */
export function ExerciseStack({
  steps,
}: {
  steps: readonly Pick<CatalogStep, 'exercise' | 'name'>[];
}) {
  const exercises = [...new Map(steps.map((step) => [step.name, step])).values()];
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
          <ExerciseFigure exercise={step.exercise} size={22} />
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
