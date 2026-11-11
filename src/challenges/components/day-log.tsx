import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ExerciseStack } from './exercise-stack';
import { SessionViewer } from './session-viewer';
import type { LogRow } from '@/challenges/library-view';
import { dayReel, type Clip } from '@/challenges/reel';
import { mss } from '@/lib/duration';
import { Icon } from '@/components/icon';
import { SadFigure } from '@/components/illustrations';
import { RollingLines } from './rolling-lines';
import { EXERCISES } from '@/exercises/registry';
import { videosOf } from '@/storage/set-files';
import { colors } from '@/theme';
import { pad } from '@/lib/day';

/** "07:42": the time it started where you were then, whatever the phone's zone is now. */
function clock({ startedAt, tzOffsetMin }: LogRow) {
  const at = new Date(startedAt + tzOffsetMin * 60_000);
  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
}

/**
 * The workouts saved on a day, a row each, oldest first; `empty` when there are none. A row whose sets
 * have videos plays them full screen, a challenge's try too: its page shows only the try that counts. Its
 * files are listed once, as it mounts: key it by the rows' workout ids.
 */
export function DayLog({
  label,
  rows,
  empty,
}: {
  label: string;
  rows: readonly LogRow[];
  /** Said when there are no rows; several take turns. */
  empty: string | readonly string[];
}) {
  // shortcut: a workout saved while its last file was still finalizing misses that set until the list
  // remounts (another day picked, or another workout saved); list again when the camcorder wraps if that
  // shows up on the phone.
  const [videos] = useState(() => videosOf(rows.flatMap((row) => row.sets.map(({ id }) => id))));
  const [watching, setWatching] = useState<{ clips: Clip[]; sets: number } | null>(null);
  return (
    <View className="gap-3">
      <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
      {rows.length === 0 && (
        <View className="items-center gap-3 py-6">
          <SadFigure size={88} weight={1} color={colors.muted} />
          {typeof empty === 'string' ? (
            <Text className="text-center font-sans text-base leading-normal text-soft">
              {empty}
            </Text>
          ) : (
            <RollingLines lines={empty} />
          )}
        </View>
      )}
      <View className="gap-2.5">
        {rows.map((row) => {
          const { steps } = row;
          // Videos are kept 30 days and only on the phone that filmed them: no files, no play.
          const clips = steps ? dayReel(steps, row.sets, videos) : [];
          const sets = steps?.filter((step) => step.exercise !== 'rest').length ?? 0;
          const play = () => setWatching({ clips, sets });
          return (
            <Row key={row.workoutId} row={row} onPress={clips.length > 0 ? play : undefined} />
          );
        })}
      </View>
      {watching && (
        <SessionViewer
          clips={watching.clips}
          sets={watching.sets}
          start={{ clip: 0, part: 0 }}
          onClose={() => setWatching(null)}
        />
      )}
    </View>
  );
}

/** Outlined like a catalog card: the exercises, the name, when and which day, and what it got. */
function Row({ row, onPress }: { row: LogRow; onPress?: () => void }) {
  const note = `${clock(row)}${row.free ? ' · ONE GO' : row.runDay ? ` · DAY ${row.runDay.number} OF ${row.runDay.of}` : ''}`;
  const amount = row.held ? mss(Math.floor(row.heldMs / 1000)) : String(row.reps);
  const unit = row.held ? 'HELD' : 'REPS';
  return (
    <View className="overflow-hidden rounded-2xl border border-line">
      <Pressable
        accessibilityRole={onPress && 'button'}
        accessibilityLabel={`${row.name}, ${note.toLowerCase()}, ${amount} ${unit.toLowerCase()}`}
        accessibilityHint={onPress && 'Plays its sets'}
        disabled={!onPress}
        onPress={onPress}
        android_ripple={{ color: colors.surface }}
        className="flex-row items-center gap-4 py-4 pl-4 pr-5"
      >
        <ExerciseStack
          steps={row.exercises.map((exercise) => ({ exercise, name: EXERCISES[exercise].name }))}
        />
        <View className="flex-1 gap-1">
          <Text numberOfLines={1} className="font-sans text-lg tracking-tight text-chalk">
            {row.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {onPress && <Icon name="play_arrow" size={14} color={colors.muted} />}
            <Text className="font-mono text-xs tracking-wide text-muted">{note}</Text>
          </View>
        </View>
        <View className="items-end gap-1">
          <Text className="font-sans text-5xl font-extralight leading-none tracking-tighter text-chalk">
            {amount}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">{unit}</Text>
        </View>
      </Pressable>
    </View>
  );
}
