import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BestRepClip, shareBestRep } from './best-rep-clip';
import { IconButton } from '@/components/icon-button';
import { EXERCISES } from '@/exercises/registry';
import type { StepResult } from '@/workout/results';
import type { SessionView } from '@/workout/session-view';

import { mss } from './controls';
import { PrimaryButton } from '@/components/primary-button';
import { SwitchRow } from '@/components/switch-row';
import { TextButton } from '@/components/text-button';
import { colors } from '@/theme';
import { RepStrip } from './rep-strip';

function SetRow({ set }: { set: StepResult }) {
  const { goal, reps, noReps, heldMs, attempts, stats } = set;
  const { name, gauge, kind } = EXERCISES[set.exercise];
  const amount = kind === 'hold' ? Math.floor(heldMs / 1000) : reps;
  const unit = kind === 'hold' ? ' s' : '';
  return (
    <View className="gap-2.5 border-b border-line py-3.5">
      <View className="flex-row justify-between gap-4">
        <Text className="font-mono text-sm tracking-wider text-muted">{name.toUpperCase()}</Text>
        <Text className="font-mono text-sm tracking-wider text-chalk">
          {goal.type === 'max' ? amount : `${amount}/${goal.n}`}
          {unit}
          {noReps > 0 && (
            <Text className="text-warn">
              {' '}
              · {noReps} NO-REP{noReps > 1 ? 'S' : ''}
            </Text>
          )}
        </Text>
      </View>
      <View className="flex-row items-end justify-between gap-4">
        {gauge && <RepStrip attempts={attempts} gauge={gauge} />}
        {stats && (
          <Text className="shrink text-right font-mono text-xs tracking-wider text-muted">
            {stats}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Board 14: clean reps or held seconds, one row per set, then the best rep to watch and send. */
export function ChallengeDone({
  view,
  title,
  onShare,
  onClose,
}: {
  view: SessionView;
  title: string;
  /** Whether to keep this session's traces for sending; unshared ones are deleted as the session stops. */
  onShare: (share: boolean) => void;
  onClose: () => void;
}) {
  const { top, bottom, left, right } = useSafeAreaInsets();
  const onlyHolds =
    view.results.length > 0 && view.results.every((set) => EXERCISES[set.exercise].kind === 'hold');
  const amount = onlyHolds
    ? Math.floor(view.results.reduce((n, set) => n + set.heldMs, 0) / 1000)
    : view.results.reduce((n, set) => n + set.reps, 0);
  const unit = onlyHolds
    ? `${amount === 1 ? 'second' : 'seconds'} held`
    : `clean ${amount === 1 ? 'rep' : 'reps'}`;
  const { best } = view;
  // Off until you turn it on: sharing is your choice, never a default.
  const [share, setShare] = useState(false);
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
        <IconButton icon="close" label="Close" onPress={onClose} style={{ marginRight: -12 }} />
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-5 px-6 pt-5 pb-4"
      >
        <View
          accessible
          accessibilityLabel={`${amount} ${unit} in ${minutes} minutes ${seconds} seconds`}
          className="gap-1.5"
        >
          <Text className="font-sans text-9xl font-thin leading-none tracking-tighter text-accent">
            {amount}
          </Text>
          <Text className="font-sans text-2xl font-light leading-tight text-chalk">
            {unit} in {mss(view.elapsedS)}.
          </Text>
        </View>
        <View className="border-t border-line">
          {view.results.map((set, i) => (
            // Results only ever append; a challenge may repeat an exercise.
            <SetRow key={`${i}-${set.exercise}`} set={set} />
          ))}
        </View>
        <SwitchRow
          label="Share movement data (no video)"
          note={
            share
              ? 'Thank you. Your joint positions, as plain numbers, help us count reps better for everyone. No video and no face leave your phone.'
              : 'Only joint positions as plain numbers: no video, no face. It is how we teach the camera to count better.'
          }
          value={share}
          onChange={(on) => {
            setShare(on);
            // Sent on every flip, so leaving by Back keeps the choice too.
            onShare(on);
          }}
        />
      </ScrollView>

      <View className="gap-3 px-6 pt-3">
        {/* `best` lands a moment after finishing, once its file is final. */}
        {best && <BestRepClip best={best} />}
        {best ? (
          <>
            <PrimaryButton onPress={() => void shareBestRep(best)} label="Send my best set" />
            <TextButton
              label="Done"
              color={colors.soft}
              onPress={onClose}
              style={{ alignSelf: 'center', marginTop: -6 }}
            />
          </>
        ) : (
          <PrimaryButton onPress={onClose} label="Done" />
        )}
      </View>
    </View>
  );
}
