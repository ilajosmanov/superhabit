import { Link } from 'expo-router';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { ExerciseStack, StepsButton } from './exercise-stack';
import { Icon } from '@/components/icon';
import { colors } from '@/theme';
import type { CatalogEntry } from '@/challenges/catalog';
import { doneToday, type Run } from '@/challenges/days';

/** One square per day: amber = done, amber outline = today, hairline = missed or still ahead. */
function DayGrid({ run: { day, days, done } }: { run: Run }) {
  return (
    // 176 wide fits ten 12px squares with 6px gaps, so the grid wraps at ten a row.
    <View className="w-44 flex-row flex-wrap gap-1.5">
      {Array.from({ length: days }, (_, i) => {
        const today = i === day - 1 && !done[i];
        return (
          <View
            key={i}
            className={`size-3 rounded-sm border ${done[i] ? 'border-accent bg-accent' : today ? 'border-accent' : 'border-line'}`}
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
  run,
  entry,
  style,
}: {
  run: Run;
  entry: CatalogEntry;
  style?: ViewStyle;
}) {
  const done = doneToday(run);
  const status = done ? 'DONE TODAY' : 'DUE TODAY';
  const body = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${entry.name}, day ${run.day} of ${run.days}, ${status.toLowerCase()}`}
      android_ripple={{ color: colors.line }}
      className="gap-5 p-5"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {done ? (
            <Icon name="check" size={16} />
          ) : (
            <View className="size-1.5 rounded-full bg-accent" />
          )}
          <Text className="font-mono text-xs tracking-widest text-muted">{status}</Text>
        </View>
        <Icon name="arrow_forward" size={20} />
      </View>

      <View className="flex-row items-end justify-between gap-3">
        <View className="shrink gap-2.5">
          <Text className="font-sans text-3xl font-light leading-none tracking-tight text-chalk">
            {entry.name}
          </Text>
          <DayGrid run={run} />
        </View>
        <View className="items-end gap-1">
          <Text className="font-sans text-8xl font-extralight leading-none tracking-tighter text-chalk">
            {run.day}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">OF {run.days}</Text>
        </View>
      </View>

      {/* One line, so every card in the swipe row stays the same height; (i) lists them all. */}
      <View className="flex-row items-center justify-between border-t border-line pt-4">
        <ExerciseStack steps={entry.steps} />
        <StepsButton entry={entry} />
      </View>
    </Pressable>
  );

  return (
    // The wrapper clips the ripple to the card's corners.
    <View className="overflow-hidden rounded-3xl border border-edge bg-surface" style={style}>
      <Link href={{ pathname: '/challenge/[id]', params: { id: entry.id } }} asChild>
        {body}
      </Link>
    </View>
  );
}
