import { Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { EXERCISES, isExerciseId } from '@/exercises/registry';
import type { Board } from '@/leaderboard/leaderboard';
import { capitalise } from '@/lib/text';
import { colors } from '@/theme';

/**
 * How points count, from the server's own table: what a rep (or ten seconds of a hold) scores, a bar per
 * exercise so "harder scores more" reads at a glance, and the streak bonus. The squat is the unit.
 */
export function PointsSheet({
  open,
  board,
  bonus,
  onDismiss,
}: {
  open: boolean;
  board: Board;
  /** Your bonus now, in whole percent. */
  bonus: number;
  onDismiss: () => void;
}) {
  // Exercises this app knows, reps by points, then holds.
  const rows = board.rates
    .flatMap((rate) => (isExerciseId(rate.exercise) ? [{ ...rate, id: rate.exercise }] : []))
    .sort((a, b) => (a.per === b.per ? b.points - a.points : a.per === 'rep' ? -1 : 1));
  const most = Math.max(...rows.map((row) => row.points), 1);
  const perDay = Math.round(board.bonus.perDay * 100);
  const maxBonus = Math.round(board.bonus.perDay * (board.bonus.days - 1) * 100);
  return (
    <Sheet open={open} onDismiss={onDismiss}>
      <View className="gap-2">
        <Text accessibilityRole="header" className="font-sans text-2xl font-light text-chalk">
          How points count
        </Text>
        <Text className="font-sans text-sm leading-normal text-soft">
          Every rep and second the camera counts, up to each set's goal; a Max set counts it all.
          Harder work scores more.
        </Text>
      </View>

      <View>
        <View className="h-7 flex-row items-center justify-between">
          <Text className="font-mono text-xs tracking-widest text-muted">EXERCISE</Text>
          <Text className="font-mono text-xs tracking-widest text-muted">POINTS A REP</Text>
        </View>
        <View className="border-t border-line">
          {rows.map(({ id, per, points }) => (
            <View
              key={id}
              accessible
              accessibilityLabel={`${EXERCISES[id].name}: ${points} points a ${per === 'rep' ? 'rep' : '10 seconds'}`}
              className="h-11 flex-row items-center gap-4 border-b border-line"
            >
              <View className="flex-1 gap-1.5">
                <Text className="font-sans text-sm text-chalk">
                  {capitalise(EXERCISES[id].name)}
                </Text>
                <View
                  className="h-0.5 rounded-full"
                  style={{
                    width: `${Math.round((points / most) * 100)}%`,
                    // The squat is the unit.
                    backgroundColor: id === 'squat' ? colors.soft : colors.edge,
                  }}
                />
              </View>
              <View className="flex-row items-baseline gap-1.5">
                <Text className="font-sans text-lg font-light text-chalk">{points.toFixed(1)}</Text>
                <Text className="w-10 font-mono text-xs tracking-widest text-muted">
                  {per === 'rep' ? '' : '/10 S'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View accessible className="flex-row items-center justify-between gap-4">
        <View className="flex-1 gap-1">
          <Text className="font-sans text-sm text-chalk">Streak bonus</Text>
          <Text className="font-sans text-xs text-muted">
            +{perDay}% for each day in a row, up to +{maxBonus}%
          </Text>
        </View>
        <Text className="font-sans text-lg font-light text-chalk">+{bonus}%</Text>
      </View>
    </Sheet>
  );
}
