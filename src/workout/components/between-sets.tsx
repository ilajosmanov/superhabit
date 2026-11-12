import { Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PhoneSetup } from './phone-setup';
import { dark as colors } from '@/theme';
import type { SessionView } from '@/workout/session/session-view';

import { Clock, CloseButton, Frame, GLASS } from './controls';
import { PrimaryButton } from '@/components/primary-button';
import { RepCount } from './rep-count';

/**
 * Board 08, over the live camera when the phone has to move: the finished set, then the next exercise and
 * its phone setup. A rest is `RestView`.
 */
export function BetweenSets({
  view,
  landscape,
  onContinue,
  onEnd,
}: {
  view: SessionView;
  landscape: boolean;
  onContinue: () => void;
  onEnd: () => void;
}) {
  const { next, unit } = view;
  if (!next) return null;
  const amount = unit === 'seconds' ? view.heldS : view.reps;
  const target = unit === 'seconds' ? view.goalS : view.target;
  const close = <CloseButton onPress={onEnd} label="End workout" />;
  const clock = (
    <Clock
      elapsedS={view.elapsedS}
      recording={view.recording}
      waiting={false}
      lowSpace={view.lowSpace}
    />
  );
  return (
    <>
      <View className="absolute inset-0 bg-ground/70" />
      <Frame landscape={landscape}>
        <View className={`gap-5 ${landscape ? 'flex-1' : ''}`}>
          {landscape ? (
            <View className="flex-row items-center gap-2 self-start">
              {close}
              {clock}
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              {close}
              {clock}
              <View className="size-11" />
            </View>
          )}
          <View
            accessible
            accessibilityLabel={`${view.name}, set ${view.set} of ${view.sets} done: ${amount} ${unit}`}
            className="gap-2.5 pt-3"
          >
            <View className="flex-row items-center gap-2">
              <Icon name="check" size={16} color={colors.accent} />
              <Text className="font-mono text-xs font-medium tracking-widest text-soft">
                {view.name.toUpperCase()} · SET {view.set} OF {view.sets} DONE
              </Text>
            </View>
            {/* The group's label already says the count; no second TalkBack stop. */}
            <View importantForAccessibility="no-hide-descendants">
              <RepCount reps={amount} target={target} unit={unit} />
            </View>
            <View className="h-2 rounded-sm bg-accent" />
          </View>
        </View>

        <View
          className={`gap-4 rounded-4xl p-5 ${GLASS} ${landscape ? 'w-96 self-end' : 'mt-auto'}`}
        >
          <View className="gap-1.5">
            <Text className="font-mono text-xs font-medium tracking-widest text-muted">
              NEXT ·{' '}
              {view.nextGoal?.type === 'reps'
                ? `${view.nextGoal.n} `
                : view.nextGoal?.type === 'seconds'
                  ? `${view.nextGoal.n}S `
                  : 'MAX '}
              {next.name.toUpperCase()}
            </Text>
            {!view.samePlacement && <PhoneSetup exercise={next} />}
          </View>
          <PrimaryButton onPress={onContinue} label="Continue" />
          {!view.samePlacement && (
            <Text className="text-center font-sans text-sm text-muted">{next.hint}</Text>
          )}
        </View>
      </Frame>
    </>
  );
}
