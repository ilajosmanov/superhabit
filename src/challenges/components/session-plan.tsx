import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { capitalise, type PlanRow, type plan } from '@/challenges/challenges';
import { Icon } from '@/components/icon';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES, orientation } from '@/exercises/registry';
import { colors } from '@/theme';
import type { Goal } from '@/workout/plan';
import { setShare } from '@/workout/results';

const hold = (row: PlanRow) => EXERCISES[row.exercise].kind === 'hold';
const amount = (goal: Goal) => (goal.type === 'max' ? 'Max' : String(goal.n));

/**
 * A day of a challenge you are in: what each exercise set got, in session order (`setAmounts`: reps, or
 * exact seconds held), and the
 * set to do now on today, -1 when none is.
 */
export type DayDone = { done: readonly number[]; next: number };

/**
 * What one day asks for and, given `day`, what it got. A one-exercise, one-round session is its goal as the
 * page's numeral (what you did, once you did any); anything more is a list of parts: each part says its
 * rounds and rest once, each row gives its goal per round, with a segment per round once you are in, and a
 * phone line sits wherever the phone has to move.
 */
export function SessionPlan({
  plan: { parts, single },
  days,
  day,
}: {
  plan: ReturnType<typeof plan>;
  days: number;
  day?: DayDone;
}) {
  if (single) {
    const got = day?.done[0] ?? 0;
    const share = setShare(single.goal, got);
    const labels = numeralLabels(single, got, days);
    return (
      <View className="gap-5">
        {single.move && <Move row={single} />}
        {/* Clipped so the numeral rises out of its baseline, like the podium steps. */}
        <View className="flex-row items-end justify-between overflow-hidden">
          <Animated.View key={got} entering={FadeInDown.duration(500)}>
            <Text
              className="-ml-1.5 font-sans text-9xl font-extralight leading-none tracking-tighter"
              style={{ color: share >= 1 ? colors.accent : colors.chalk }}
            >
              {got === 0 ? amount(single.goal) : Math.floor(got)}
            </Text>
          </Animated.View>
          <View className="items-end gap-1 pb-4">
            {labels.map((label) => (
              <Text key={label} className="font-mono text-xs tracking-widest text-muted">
                {label}
              </Text>
            ))}
          </View>
        </View>
        {day && <Fill share={share} height={6} />}
      </View>
    );
  }
  // Where each part's sets start in session order: a part runs its rows in order, round after round.
  const starts = parts.map((_, i) =>
    parts.slice(0, i).reduce((sum, part) => sum + part.rounds * part.rows.length, 0),
  );
  return (
    <View className="gap-7">
      {parts.map(({ label, rounds, rows }, i) => {
        const set = (round: number, j: number) => starts[i] + round * rows.length + j;
        const next = day ? day.next - starts[i] : -1;
        const here = next >= 0 && next < rounds * rows.length;
        return (
          // Parts don't change while the screen is up.
          <View key={i}>
            {rows[0]?.move && <Move row={rows[0]} />}
            {(label !== '' || here) && (
              <View className="flex-row justify-between pb-2.5">
                <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
                {here && rounds > 1 && (
                  <Text className="font-mono text-xs tracking-widest text-accent">
                    {`ROUND ${Math.floor(next / rows.length) + 1} OF ${rounds}`}
                  </Text>
                )}
              </View>
            )}
            {rows.map((row, j) => (
              // A part may repeat an exercise, so the index is part of the key.
              <View key={`${j}-${row.exercise}`}>
                {j > 0 && row.move && <Move row={row} />}
                <Row
                  row={row}
                  got={day && Array.from({ length: rounds }, (_, r) => day.done[set(r, j)])}
                  live={here && next % rows.length === j}
                />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** The two words beside a one-exercise session's numeral: its unit and what the number is. */
export function numeralLabels(row: PlanRow, got: number, days: number) {
  const unit = hold(row) ? 'SECONDS' : 'CLEAN REPS';
  if (got === 0) return [unit, days > 1 ? 'EVERY DAY' : 'IN ONE GO'];
  return row.goal.type === 'max' ? [unit, 'YOUR MAX'] : [`OF ${row.goal.n}`, unit];
}

/** A track filled from the left by `share`. */
function Fill({ share, height }: { share: number; height: number }) {
  return (
    <View className="overflow-hidden bg-line" style={{ height, borderRadius: height / 2 }}>
      <View className="h-full bg-accent" style={{ width: `${share * 100}%` }} />
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

/**
 * One exercise and its goal per round. `got`, once you are in, is what each round of it did on the day
 * shown; `live` marks the set to do now.
 */
function Row({ row, got, live }: { row: PlanRow; got?: readonly number[]; live: boolean }) {
  const name = capitalise(EXERCISES[row.exercise].name);
  const unit = hold(row) ? 'SEC' : 'REPS';
  const spoken =
    row.goal.type === 'max'
      ? `as ${hold(row) ? 'long' : 'many'} as you can`
      : `${row.goal.n} ${hold(row) ? 'seconds' : 'reps'}`;
  // Held seconds are kept exact; the page shows whole ones.
  const total = Math.floor(got?.reduce((sum, n) => sum + n, 0) ?? 0);
  const tally =
    row.goal.type === 'max' ? String(total) : `${total}/${row.goal.n * (got?.length ?? 0)}`;
  return (
    <View
      accessible
      accessibilityLabel={`${name}, ${spoken}${got && got.length > 1 ? ' a round' : ''}${
        got ? `, ${total} ${hold(row) ? 'seconds' : 'reps'} done` : ''
      }${live ? ', up next' : ''}`}
      className="min-h-19 flex-row items-center gap-4 border-t border-line py-3"
    >
      <View
        className="size-12 items-center justify-center rounded-xl border"
        style={{
          borderColor: live ? colors.faint : colors.line,
          backgroundColor: live ? colors.surface : undefined,
        }}
      >
        <ExerciseFigure exercise={row.exercise} size={30} />
      </View>
      <View className="flex-1 gap-2">
        <Text numberOfLines={1} className="font-sans text-lg tracking-tight text-chalk">
          {name}
        </Text>
        {got ? (
          <View className="flex-row items-center gap-2.5">
            {/* One segment per round: full when its goal was met, short where it stopped. */}
            <View className="flex-1 flex-row gap-1">
              {got.map((n, r) => (
                // Rounds don't reorder.
                <View key={r} className="flex-1">
                  <Fill share={setShare(row.goal, n)} height={4} />
                </View>
              ))}
            </View>
            <Text className="font-mono text-xs tracking-wider text-muted">{tally}</Text>
          </View>
        ) : (
          <Text className="font-mono text-xs tracking-widest text-muted">
            {hold(row) ? 'TIMED HOLD' : 'CLEAN REPS'}
          </Text>
        )}
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
