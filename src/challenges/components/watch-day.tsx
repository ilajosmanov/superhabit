import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SessionViewer } from './session-viewer';
import { SwipeRow } from './swipe-row';
import { isHold } from '@/challenges/hold';
import type { TrackedSets } from '@/challenges/plan-view';
import { dayReel, type Clip, type Spot } from '@/challenges/reel';
import { IconButton } from '@/components/icon-button';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES } from '@/exercises/registry';
import { capitalise } from '@/lib/text';
import { useColors } from '@/components/colors';
import type { LoggedSet } from '@/workout/plan/logged-set';
import type { FlatSteps } from '@/workout/plan/plan';

const CARD = 152;

type Step = TrackedSets['sets'][number];

/**
 * Under a day you tried: a frame per set you did, in session order, to swipe through like a reel. `done`
 * is what each set got (`setAmounts`); sets left at nothing were never filmed, so they are left out. A
 * frame with video plays the day's sets full screen from that set; `kept` are the day's sets (of the plan
 * `steps`). Availability comes from the shared video index; an opened viewer keeps its captured clips.
 */
export function WatchDay({
  label,
  sets,
  done,
  steps,
  kept,
  videos,
}: {
  label: string;
  sets: readonly Step[];
  done: readonly number[];
  steps: FlatSteps;
  kept: readonly LoggedSet[];
  videos: ReadonlyMap<string, readonly string[]>;
}) {
  const [watching, setWatching] = useState<{
    clips: readonly Clip[];
    start: Spot;
    sets: number;
  } | null>(null);
  const clips = dayReel(steps, kept, videos);
  const filmed = sets.flatMap((set, i) => (done[i] > 0 ? [{ set, got: done[i], i }] : []));
  if (filmed.length === 0) return null;
  return (
    <View className="gap-3">
      <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
      <SwipeRow itemWidth={CARD}>
        {filmed.map(({ set, got, i }) => {
          const clip = clips.findIndex((c) => c.set === i);
          return (
            <Frame
              key={i}
              set={set}
              got={got}
              n={i + 1}
              onPress={
                clip < 0
                  ? undefined
                  : () => setWatching({ clips, start: { clip, part: 0 }, sets: sets.length })
              }
            />
          );
        })}
      </SwipeRow>
      {watching && (
        <SessionViewer
          clips={watching.clips}
          sets={watching.sets}
          start={watching.start}
          onClose={() => setWatching(null)}
        />
      )}
    </View>
  );
}

/** One set as a video frame: its figure, a play disc when it has video (`onPress`), and what it got. */
function Frame({
  set,
  got,
  n,
  onPress,
}: {
  set: Step;
  got: number;
  n: number;
  onPress?: () => void;
}) {
  const colors = useColors();
  const { name } = EXERCISES[set.exercise];
  // Held seconds are kept exact; the frame shows whole ones.
  const amount = `${Math.floor(got)} ${isHold(set.exercise) ? 'S' : got === 1 ? 'REP' : 'REPS'}`;
  const round = set.rounds > 1 ? ` · ROUND ${set.round}` : '';
  return (
    <Pressable
      accessibilityRole={onPress && 'button'}
      accessibilityLabel={`Set ${n}, ${name}${round.toLowerCase()}, ${amount.toLowerCase()}`}
      accessibilityHint={onPress && 'Plays its video'}
      disabled={!onPress}
      onPress={onPress}
      style={{ width: CARD }}
      className="gap-2.5"
    >
      <View className="h-48 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface">
        <ExerciseFigure exercise={set.exercise} size={112} weight={0.9} color={colors.faint} />
        <Text className="absolute left-3 top-3 font-mono text-xs tracking-widest text-muted">
          {`SET ${n}`}
        </Text>
        {/* Material's filled icon button: it centres the symbol in its disc. 48dp target, 36dp disc.
            Hidden from TalkBack: the card is the same button, with the full label. */}
        {onPress && (
          <View
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', right: 6, bottom: 6 }}
          >
            <IconButton
              icon="play_arrow"
              label={`Play set ${n}`}
              size={18}
              fill={colors.ground}
              diameter={36}
              onPress={onPress}
            />
          </View>
        )}
      </View>
      <View className="gap-1 px-1">
        <Text numberOfLines={1} className="font-sans text-base text-chalk">
          {capitalise(name)}
        </Text>
        <Text className="font-mono text-xs tracking-widest text-muted">{`${amount}${round}`}</Text>
      </View>
    </Pressable>
  );
}
