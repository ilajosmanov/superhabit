import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { capitalise, type PlanRow, type plan } from '@/challenges/challenges';
import { Icon } from '@/components/icon';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES, orientation } from '@/exercises/registry';
import { colors } from '@/theme';
import type { Goal } from '@/workout/plan';

const hold = (row: PlanRow) => EXERCISES[row.exercise].kind === 'hold';
const amount = (goal: Goal) => (goal.type === 'max' ? 'Max' : String(goal.n));

/**
 * What one day asks for. A one-exercise, one-round session is its goal as the page's numeral; anything
 * more is a list of parts: each part says its rounds and rest once, each row gives its goal per round,
 * and a phone line sits wherever the phone has to move.
 */
export function SessionPlan({
  plan: { parts, single },
  days,
}: {
  plan: ReturnType<typeof plan>;
  days: number;
}) {
  if (single) {
    return (
      // Clipped so the numeral rises out of its baseline, like the podium steps.
      <View className="flex-row items-end justify-between overflow-hidden">
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text className="-ml-1.5 font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk">
            {amount(single.goal)}
          </Text>
        </Animated.View>
        <View className="items-end gap-1 pb-4">
          <Text className="font-mono text-xs tracking-widest text-muted">
            {hold(single) ? 'SECONDS' : 'CLEAN REPS'}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">
            {days > 1 ? 'EVERY DAY' : 'IN ONE GO'}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View className="gap-7">
      {parts.map(({ label, rows }, i) => (
        // Parts don't change while the screen is up.
        <View key={i}>
          {rows[0]?.move && <Move row={rows[0]} />}
          {label !== '' && (
            <Text className="pb-2.5 font-mono text-xs tracking-widest text-muted">{label}</Text>
          )}
          {rows.map((row, j) => (
            // A part may repeat an exercise, so the index is part of the key.
            <View key={`${j}-${row.exercise}`}>
              {j > 0 && row.move && <Move row={row} />}
              <Row row={row} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Move({ row }: { row: PlanRow }) {
  const sideways = orientation(EXERCISES[row.exercise].placement) === 'landscape';
  return (
    <View className="flex-row items-center gap-3 pb-4">
      <Icon
        name={sideways ? 'stay_current_landscape' : 'stay_current_portrait'}
        size={20}
        color={colors.soft}
      />
      <Text className="font-sans text-sm text-soft">{row.move}</Text>
    </View>
  );
}

function Row({ row }: { row: PlanRow }) {
  const name = capitalise(EXERCISES[row.exercise].name);
  const unit = hold(row) ? 'SEC' : 'REPS';
  const spoken =
    row.goal.type === 'max'
      ? `as ${hold(row) ? 'long' : 'many'} as you can`
      : `${row.goal.n} ${hold(row) ? 'seconds' : 'reps'}`;
  return (
    <View
      accessible
      accessibilityLabel={`${name}, ${spoken}`}
      className="min-h-19 flex-row items-center gap-4 border-t border-line py-3"
    >
      <View className="size-12 items-center justify-center rounded-xl border border-line">
        <ExerciseFigure exercise={row.exercise} size={30} />
      </View>
      <View className="flex-1 gap-2">
        <Text numberOfLines={1} className="font-sans text-lg tracking-tight text-chalk">
          {name}
        </Text>
        <Text className="font-mono text-xs tracking-widest text-muted">
          {hold(row) ? 'TIMED HOLD' : 'CLEAN REPS'}
        </Text>
      </View>
      <View className="w-16 items-end gap-1">
        <Text className="font-sans text-5xl font-extralight leading-none tracking-tighter text-chalk">
          {amount(row.goal)}
        </Text>
        <Text className="font-mono text-xs tracking-widest text-muted">{unit}</Text>
      </View>
    </View>
  );
}
