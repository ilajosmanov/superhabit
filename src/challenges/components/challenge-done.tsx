import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Numeral } from './numeral';
import { OVER_VIDEO } from './reel-player';
import { SessionLoop } from './session-reel';
import { numeralLabels, SessionPlan } from './session-plan';
import { plan } from '@/challenges/challenges';
import { dayWord, type Run } from '@/challenges/run-view';
import { reelOf, type Clip } from '@/challenges/reel';
import { mss } from '@/components/duration';
import { ExerciseFigure } from '@/components/illustrations';
import { PrimaryButton } from '@/components/primary-button';
import { SwitchRow } from '@/components/switch-row';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { colors } from '@/theme';
import { expand, type Challenge } from '@/workout/plan';
import { setAmounts, shareDone } from '@/workout/results';
import type { SessionView } from '@/workout/session-view';

/** How much of the screen the video takes. */
const HERO = 0.59;

/**
 * Right after a session, so you can see it all went in: the session's sets play one after another at the
 * top of the screen with what the session counted on them, a few numbers say how the reps went, and a session of several sets lists them
 * as the challenge page does, each filled by what it got. `run` is the run this session counts toward,
 * on its day, with this session counted in before it is saved (null for a one-go set).
 */
export function ChallengeDone({
  view,
  challenge,
  run,
  onShare,
  onClose,
}: {
  view: SessionView;
  challenge: Challenge;
  run: Run | null;
  /** Whether to keep this session's traces for sending; unshared ones are deleted as the session stops. */
  onShare: (share: boolean) => void;
  onClose: () => void;
}) {
  const { top, bottom, left, right } = useSafeAreaInsets();
  const session = plan(challenge);
  const steps = expand(challenge.session);
  const done = setAmounts(steps, view.results);
  const onlyHolds =
    view.results.length > 0 && view.results.every((set) => EXERCISES[set.exercise].kind === 'hold');
  // One exercise done once reads as that set against its goal; anything more as the session's total.
  const numeral = session.single
    ? { n: Math.floor(done[0]), labels: numeralLabels(session.single, done[0], challenge.days) }
    : onlyHolds
      ? {
          n: Math.floor(view.results.reduce((n, set) => n + set.heldMs, 0) / 1000),
          labels: ['SECONDS', 'HELD'],
        }
      : { n: view.results.reduce((n, set) => n + set.reps, 0), labels: ['CLEAN', 'REPS'] };
  const share = shareDone(steps, view.results);
  const day = run ? [`DAY ${run.day} OF ${run.days}`, dayWord(run, run.day - 1)] : ['ONE GO'];

  return (
    <View
      className="absolute inset-0 bg-ground"
      style={{ paddingBottom: bottom + 16, paddingLeft: left, paddingRight: right }}
    >
      {/* No close: Done is the way out. */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <Hero
          view={view}
          name={challenge.name}
          figure={session.exercises[0]}
          numeral={{ ...numeral, met: share >= 1 }}
          top={top}
        />
        <View className="gap-7 px-6 pt-5 pb-4">
          <Text className="font-mono text-xs tracking-widest text-muted">{day.join(' · ')}</Text>
          <Numbers view={view} onlyHolds={onlyHolds} />
          {!session.single && (
            <SessionPlan plan={session} days={challenge.days} day={{ done, next: -1 }} />
          )}
          <SwitchRow
            label="Keep sets on this phone"
            note={
              view.share
                ? 'Your joint positions and the videos of your sets stay on this phone, to teach the camera to count better. Nothing is uploaded.'
                : 'Joint positions and videos of this session are deleted when you close it.'
            }
            value={view.share}
            // Sent on every flip, so leaving by Back keeps the choice too.
            onChange={onShare}
          />
        </View>
      </ScrollView>

      <View className="px-6 pt-3">
        <PrimaryButton onPress={onClose} label="Done" />
      </View>
    </View>
  );
}

/**
 * The top of the screen: the session's sets playing one after another edge to edge, fading into the page,
 * with what the session counted as the numeral on them. Until every file is final, and when nothing was
 * filmed, the first exercise's figure stands in their place.
 */
function Hero({
  view,
  name,
  figure,
  numeral,
  top,
}: {
  view: SessionView;
  name: string;
  figure: ExerciseId;
  numeral: { n: number; labels: readonly string[]; met: boolean };
  top: number;
}) {
  const { height } = useWindowDimensions();
  const clips = view.final ? reelOf(view.results) : [];
  // Over the video, under its full-screen button; nothing here takes a tap. `playing`: the set on screen.
  const over = (playing: Clip | null) => (
    <>
      {/* Dark under the name, clear through the middle, the page's ground under the numeral. */}
      <View
        pointerEvents="none"
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(180deg, ${OVER_VIDEO} 0%, transparent 22%, transparent 45%, ${colors.ground} 100%)`,
        }}
      />
      <View
        pointerEvents="none"
        className="absolute right-20 left-6 gap-1.5"
        style={{ top: top + 20 }}
      >
        <Text
          numberOfLines={1}
          className="font-mono text-xs font-medium tracking-widest text-chalk"
        >
          {name.toUpperCase()}
        </Text>
        {playing && (
          <Text numberOfLines={1} className="font-mono text-xs tracking-widest text-soft uppercase">
            {`Set ${playing.set + 1} of ${view.sets} · ${EXERCISES[playing.result.exercise].name}`}
          </Text>
        )}
      </View>
    </>
  );
  return (
    <View style={{ height: height * HERO }}>
      {clips.length > 0 ? (
        <SessionLoop
          clips={clips}
          sets={view.sets}
          expand={{ top: top + 8, right: 12 }}
          className="absolute inset-0"
        >
          {over}
        </SessionLoop>
      ) : (
        <View className="absolute inset-0 items-center justify-center">
          <ExerciseFigure exercise={figure} size={220} weight={0.6} color={colors.edge} />
          {over(null)}
        </View>
      )}
      {/* Outside `over`: the trees above swap as the files turn final, and it would rise again each time. */}
      <View pointerEvents="none" className="absolute inset-x-6 bottom-0">
        <Numeral {...numeral} />
      </View>
    </View>
  );
}

/**
 * Two numbers about how the session went: the time, and what didn't count (no-reps;
 * breaks when it was only holds).
 */
function Numbers({ view, onlyHolds }: { view: SessionView; onlyHolds: boolean }) {
  const misses = view.results
    .filter((set) => onlyHolds || EXERCISES[set.exercise].kind !== 'hold')
    .reduce((n, set) => n + set.noReps, 0);
  const numbers = [
    { n: mss(view.elapsedS), label: 'TIME' },
    { n: String(misses), label: onlyHolds ? 'BREAKS' : 'NO-REPS', warn: misses > 0 },
  ];
  return (
    <View className="flex-row gap-3">
      {numbers.map(({ n, label, warn }) => (
        <View key={label} className="flex-1 gap-2">
          <Text
            className="font-sans text-4xl font-extralight tracking-tight"
            style={{ color: warn ? colors.warn : colors.chalk }}
          >
            {n}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
        </View>
      ))}
    </View>
  );
}
