import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ExerciseStack } from './exercise-stack';
import { SessionViewer } from './session-viewer';
import type { LogRow } from '@/challenges/library-view';
import { dayReel, type Clip } from '@/challenges/reel';
import { mss } from '@/components/duration';
import { Icon } from '@/components/icon';
import { SadFigure } from '@/components/illustrations';
import { RollingLines } from '@/components/rolling-lines';
import { EXERCISES } from '@/exercises/registry';
import { videosOf } from '@/storage/set-files';
import { colors } from '@/theme';
import { pad, type Day } from '@/workout/plan/day';

/** "07:42": the time it started where you were then, whatever the phone's zone is now. */
function clock({ startedAt, tzOffsetMin }: LogRow) {
  const at = new Date(startedAt + tzOffsetMin * 60_000);
  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
}

/**
 * The workouts saved on `day`, a row each, oldest first; `empty` when there are none. A row of the run you
 * are in opens its page on that day; any other row that counted something plays its sets full screen.
 */
export function DayLog({
  day,
  label,
  rows,
  empty,
}: {
  day: Day;
  label: string;
  rows: readonly LogRow[];
  /** Said when there are no rows; several take turns. */
  empty: string | readonly string[];
}) {
  const router = useRouter();
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
          const { link, steps } = row;
          // Sets that got nothing were never filmed.
          const plays = !link && steps !== null && (row.reps > 0 || row.heldMs > 0);
          // Its files are listed on the tap, never while a page slides: a set's last file may still have
          // been writing when the workout was saved.
          // shortcut: a row whose files are gone (cleared storage) shows play and does nothing.
          const play = () => {
            if (!steps) return;
            const videos = videosOf(row.sets.map(({ id }) => id));
            const clips = dayReel(steps, row.sets, videos);
            const sets = steps.filter((step) => step.exercise !== 'rest').length;
            if (clips.length > 0) setWatching({ clips, sets });
          };
          const onPress = link
            ? () =>
                router.push({
                  pathname: '/challenge/[id]',
                  params: { id: link.challengeId, run: link.runId, day },
                })
            : plays
              ? play
              : undefined;
          return <Row key={row.workoutId} row={row} plays={plays} onPress={onPress} />;
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
function Row({ row, plays, onPress }: { row: LogRow; plays: boolean; onPress?: () => void }) {
  const note = `${clock(row)}${row.free ? ' · ONE GO' : row.runDay ? ` · DAY ${row.runDay.number} OF ${row.runDay.of}` : ''}`;
  const amount = row.held ? mss(Math.floor(row.heldMs / 1000)) : String(row.reps);
  const unit = row.held ? 'HELD' : 'REPS';
  return (
    <View className="overflow-hidden rounded-2xl border border-line">
      <Pressable
        accessibilityRole={onPress && (plays ? 'button' : 'link')}
        accessibilityLabel={`${row.name}, ${note.toLowerCase()}, ${amount} ${unit.toLowerCase()}`}
        accessibilityHint={plays ? 'Plays its sets' : onPress && 'Opens this day of the challenge'}
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
            {plays && <Icon name="play_arrow" size={14} color={colors.muted} />}
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
