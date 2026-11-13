import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SessionViewer } from './session-viewer';
import { SetSheet } from './set-sheet';
import { SwipeRow } from './swipe-row';
import { isHold } from '@/challenges/hold';
import type { TrackedSets } from '@/challenges/plan-view';
import { dayReel, setIndex, type Clip, type Spot } from '@/challenges/reel';
import { IconButton } from '@/components/icon-button';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES } from '@/exercises/registry';
import { pad } from '@/lib/day';
import { capitalise } from '@/lib/text';
import { useColors } from '@/components/colors';
import type { LoggedSet } from '@/workout/plan/logged-set';
import type { FlatSteps } from '@/workout/plan/plan';
import { setDetails } from '@/workout/store';

const CARD = 152;

type Step = TrackedSets['sets'][number];

/** "07:42" on this phone's clock. */
const clock = (at: number) => {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Under a day you tried: a frame per set you did, in session order, to swipe through like a reel. `done`
 * is what each set got (`setAmounts`); sets left at nothing were never filmed, so they are left out. A
 * frame opens that set up close (a daily total's frame, every try of it); its play disc, when it has
 * video, plays the day's sets full screen from that set. `kept` are the day's sets (of the plan `steps`).
 * Availability comes from the shared video index; an opened viewer keeps its captured clips.
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
  const [closeUp, setCloseUp] = useState<{
    set: Step;
    kicker: string;
    kept: ReturnType<typeof setDetails>;
    onPlay?: () => void;
  } | null>(null);
  const clips = dayReel(steps, kept, videos);
  const frameOf = ({ planStep, exercise }: LoggedSet) =>
    steps[planStep]?.exercise === exercise ? setIndex(steps, planStep) : -1;
  // Each frame's kept sets, placed once: not searched again per frame.
  const keptAt = new Map<number, string[]>();
  for (const set of kept) keptAt.set(frameOf(set), [...(keptAt.get(frameOf(set)) ?? []), set.id]);
  const filmed = sets.flatMap((set, i) => (done[i] > 0 ? [{ set, got: done[i], i }] : []));
  if (filmed.length === 0) return null;
  return (
    <View className="gap-3">
      <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
      <SwipeRow itemWidth={CARD}>
        {filmed.map(({ set, got, i }) => {
          const clip = clips.findIndex((c) => c.set === i);
          const play =
            clip < 0
              ? undefined
              : () => setWatching({ clips, start: { clip, part: 0 }, sets: sets.length });
          const ids = keptAt.get(i) ?? [];
          const open = () => {
            const rows = setDetails(ids);
            const first = rows.at(0);
            if (!first) return;
            const round = set.rounds > 1 ? ` · ROUND ${set.round}` : '';
            const when = rows.length > 1 ? `${rows.length} TRIES` : clock(first.startedAt);
            setCloseUp({ set, kept: rows, kicker: `SET ${i + 1}${round} · ${when}`, onPlay: play });
          };
          return (
            <Frame
              key={i}
              set={set}
              got={got}
              n={i + 1}
              onPress={ids.length > 0 ? open : undefined}
              onPlay={play}
            />
          );
        })}
      </SwipeRow>
      {closeUp && (
        <SetSheet
          exercise={closeUp.set.exercise}
          goal={closeUp.set.goal}
          kicker={closeUp.kicker}
          kept={closeUp.kept}
          onPlay={
            closeUp.onPlay &&
            (() => {
              setCloseUp(null);
              closeUp.onPlay?.();
            })
          }
          onDismiss={() => setCloseUp(null)}
        />
      )}
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

/** One set as a video frame: its figure, what it got, and a play disc when it has video (`onPlay`). */
function Frame({
  set,
  got,
  n,
  onPress,
  onPlay,
}: {
  set: Step;
  got: number;
  n: number;
  /** Opens the set up close. */
  onPress?: () => void;
  onPlay?: () => void;
}) {
  const colors = useColors();
  const { name } = EXERCISES[set.exercise];
  // Held seconds are kept exact; the frame shows whole ones.
  const amount = `${Math.floor(got)} ${isHold(set.exercise) ? 'S' : got === 1 ? 'REP' : 'REPS'}`;
  const round = set.rounds > 1 ? ` · ROUND ${set.round}` : '';
  return (
    <View style={{ width: CARD }}>
      <Pressable
        accessibilityRole={onPress && 'button'}
        accessibilityLabel={`Set ${n}, ${name}${round.toLowerCase()}, ${amount.toLowerCase()}`}
        accessibilityHint={
          onPress && (isHold(set.exercise) ? 'Shows time held and breaks' : 'Shows each rep')
        }
        disabled={!onPress}
        onPress={onPress}
        className="gap-2.5"
      >
        <View className="h-48 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface">
          <ExerciseFigure exercise={set.exercise} size={112} weight={0.9} color={colors.faint} />
          <Text className="absolute left-3 top-3 font-mono text-xs tracking-widest text-muted">
            {`SET ${n}`}
          </Text>
        </View>
        <View className="gap-1 px-1">
          <Text numberOfLines={1} className="font-sans text-base text-chalk">
            {capitalise(name)}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">{`${amount}${round}`}</Text>
        </View>
      </Pressable>
      {/* Over the card's picture, not inside its Pressable: a native button nested in it could fire both.
          Material's filled icon button centres the symbol in its disc. 48dp target, 36dp disc. */}
      {onPlay && (
        <View pointerEvents="box-none" className="absolute inset-x-0 top-0 h-48">
          <View style={{ position: 'absolute', right: 6, bottom: 6 }}>
            <IconButton
              icon="play_arrow"
              label={`Play set ${n}`}
              size={18}
              fill={colors.ground}
              diameter={36}
              onPress={onPlay}
            />
          </View>
        </View>
      )}
    </View>
  );
}
