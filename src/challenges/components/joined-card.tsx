import { Link } from 'expo-router';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { ExerciseStack, StepsButton } from './exercise-stack';
import { Icon } from '@/components/icon';
import { colors } from '@/theme';
import type { CatalogEntry } from '@/challenges/catalog';
import { doneToday, percent, type RunView } from '@/challenges/run-view';

/**
 * One square per day: amber = done, filled from the bottom by the share of a partial try, amber outline =
 * today, hairline = no try or still ahead.
 */
function DayGrid({ run: { day, days, progress } }: { run: RunView }) {
  return (
    // 176 wide fits ten 12px squares with 6px gaps, so the grid wraps at ten a row.
    <View className="w-44 flex-row flex-wrap gap-1.5">
      {Array.from({ length: days }, (_, i) => {
        const share = progress[i] ?? 0;
        const today = i === day - 1 && share < 1;
        return (
          <View
            key={i}
            // Colours by style: swapping classes remounts the view (NativeWind).
            style={{ borderColor: share > 0 || today ? colors.accent : colors.line }}
            className="size-3 justify-end overflow-hidden rounded-sm border"
          >
            {share > 0 && (
              <View className="bg-accent" style={{ height: `${Math.round(share * 100)}%` }} />
            )}
          </View>
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
  run: RunView;
  entry: CatalogEntry;
  style?: ViewStyle;
}) {
  const done = doneToday(run);
  const share = run.progress[run.day - 1];
  const status = done ? 'DONE TODAY' : share > 0 ? `TODAY ${percent(share)}` : 'DUE TODAY';
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
          <Text
            maxFontSizeMultiplier={1}
            className="font-sans text-8xl font-extralight leading-none tracking-tighter text-chalk"
          >
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
      {/* The run too: several runs of one challenge each open their own. */}
      <Link href={{ pathname: '/challenge/[id]', params: { id: entry.id, run: run.id } }} asChild>
        {body}
      </Link>
    </View>
  );
}
