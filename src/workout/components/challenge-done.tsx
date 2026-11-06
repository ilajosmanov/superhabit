import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BestRepClip, shareBestRep } from '@/components/best-rep-clip';
import { CLOSE, Glyph } from '@/components/glyph';
import type { SessionView, SetResult } from '@/workout/session';

import { RepStrip } from './rep-strip';

/** 312 -> "5:12". */
const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function SetRow({ set }: { set: SetResult }) {
  const { name, target, reps, noReps, attempts, down, stats } = set;
  return (
    <View className="gap-2.5 border-b border-line py-3.5">
      <View className="flex-row justify-between gap-4">
        <Text className="font-mono text-sm tracking-wider text-muted">{name.toUpperCase()}</Text>
        <Text className="font-mono text-sm tracking-wider text-chalk">
          {Number.isFinite(target) ? `${reps}/${target}` : reps}
          {noReps > 0 && (
            <Text className="text-warn">
              {' '}
              · {noReps} NO-REP{noReps > 1 ? 'S' : ''}
            </Text>
          )}
        </Text>
      </View>
      <View className="flex-row items-end justify-between gap-4">
        <RepStrip attempts={attempts} down={down} />
        {stats && (
          <Text className="shrink text-right font-mono text-xs tracking-wider text-muted">
            {stats}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Board 14: clean reps over the whole challenge, one row per set, then the best rep to watch and send. */
export function ChallengeDone({
  view,
  title,
  onClose,
}: {
  view: SessionView;
  title: string;
  onClose: () => void;
}) {
  const { top, bottom, left, right } = useSafeAreaInsets();
  const clean = view.results.reduce((n, set) => n + set.reps, 0);
  const { best } = view;
  const minutes = Math.floor(view.elapsedS / 60);
  const seconds = view.elapsedS % 60;

  return (
    <View
      className="absolute inset-0 bg-ground"
      style={{
        paddingTop: top + 20,
        paddingBottom: bottom + 16,
        paddingLeft: left,
        paddingRight: right,
      }}
    >
      <View className="mx-6 h-11 flex-row items-center justify-between border-b border-line">
        <Text
          numberOfLines={1}
          className="shrink font-mono text-xs font-medium tracking-widest text-muted"
        >
          {title.toUpperCase()}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="-mr-3 size-11 items-center justify-center"
        >
          <Glyph d={CLOSE} size={20} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-5 px-6 pt-5 pb-4"
      >
        <View
          accessible
          accessibilityLabel={`${clean} clean ${clean === 1 ? 'rep' : 'reps'} in ${minutes} minutes ${seconds} seconds`}
          className="gap-1.5"
        >
          <Text className="font-sans text-9xl font-thin leading-none tracking-tighter text-accent">
            {clean}
          </Text>
          <Text className="font-sans text-2xl font-light leading-tight text-chalk">
            clean {clean === 1 ? 'rep' : 'reps'} in {mss(view.elapsedS)}.
          </Text>
        </View>
        <View className="border-t border-line">
          {view.results.map((set, i) => (
            // Results only ever append; a challenge may repeat an exercise.
            <SetRow key={`${i}-${set.name}`} set={set} />
          ))}
        </View>
      </ScrollView>

      <View className="gap-3 px-6 pt-3">
        {/* `best` lands a moment after finishing, once its file is final. */}
        {best && <BestRepClip best={best} />}
        {best && (
          <Pressable
            onPress={() => void shareBestRep(best)}
            accessibilityRole="button"
            className="h-14 items-center justify-center rounded-full bg-accent"
          >
            <Text className="font-sans text-lg font-medium text-ground">Send my best set</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          className={`items-center justify-center ${best ? '-mt-1.5 h-11' : 'h-14 rounded-full bg-accent'}`}
        >
          <Text
            className={`font-sans ${best ? 'text-base text-soft' : 'text-lg font-medium text-ground'}`}
          >
            Done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
