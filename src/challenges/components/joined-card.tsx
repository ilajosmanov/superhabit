import { Link } from 'expo-router';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { ExerciseStack, StepsButton } from './exercise-stack';
import { CHECK, Glyph } from '@/components/glyph';
import { colors } from '@/theme';
import type { CatalogEntry } from '@/challenges/catalog';

const ARROW_RIGHT = 'M5 12h14M13 6l6 6-6 6';

/** A challenge you joined: today is `day` of `days`. Days before today are done. */
export type Joined = { id: string; day: number; days: number; doneToday: boolean };

/** One square per day: amber = done, amber outline = today, hairline = still ahead. */
function DayGrid({ day, days, doneToday }: Joined) {
  return (
    // 176 wide fits ten 12px squares with 6px gaps, so the grid wraps at ten a row.
    <View className="w-44 flex-row flex-wrap gap-1.5">
      {Array.from({ length: days }, (_, i) => {
        const done = i < day - 1 || (i === day - 1 && doneToday);
        const today = i === day - 1 && !doneToday;
        return (
          <View
            key={i}
            className={`size-3 rounded-sm border ${done ? 'border-accent bg-accent' : today ? 'border-accent' : 'border-line'}`}
          />
        );
      })}
    </View>
  );
}

/**
 * A challenge you joined. Only joined challenges get this card (day grid, status line), so nothing
 * you haven't picked looks picked. `style` sets the width inside the swipe row.
 */
export function JoinedCard({
  joined,
  entry,
  style,
}: {
  joined: Joined;
  entry: CatalogEntry;
  style?: ViewStyle;
}) {
  const status = joined.doneToday ? 'DONE TODAY' : 'DUE TODAY';
  const body = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${entry.name}, day ${joined.day} of ${joined.days}, ${status.toLowerCase()}`}
      android_ripple={{ color: colors.line }}
      className="gap-5 p-5"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {joined.doneToday ? (
            <Glyph d={CHECK} size={14} weight={2} />
          ) : (
            <View className="size-1.5 rounded-full bg-accent" />
          )}
          <Text className="font-mono text-xs tracking-widest text-muted">{status}</Text>
        </View>
        <Glyph d={ARROW_RIGHT} size={20} />
      </View>

      <View className="flex-row items-end justify-between gap-3">
        <View className="shrink gap-2.5">
          <Text className="font-sans text-3xl font-light leading-none tracking-tight text-chalk">
            {entry.name}
          </Text>
          <DayGrid {...joined} />
        </View>
        <View className="items-end gap-1">
          <Text className="font-sans text-8xl font-extralight leading-none tracking-tighter text-chalk">
            {joined.day}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">OF {joined.days}</Text>
        </View>
      </View>

      {/* One line, so every card in the swipe row stays the same height; (i) lists them all. */}
      <View className="flex-row items-center justify-between border-t border-line pt-4">
        <ExerciseStack entry={entry} />
        <StepsButton entry={entry} />
      </View>
    </Pressable>
  );

  return (
    // The wrapper clips the ripple to the card's corners.
    <View className="overflow-hidden rounded-3xl border border-edge bg-surface" style={style}>
      <Link href={{ pathname: '/challenge/[id]', params: { id: joined.id } }} asChild>
        {body}
      </Link>
    </View>
  );
}
