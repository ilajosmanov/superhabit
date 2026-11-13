import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/components/colors';
import { tick } from '@/components/tick';
import type { Challenge } from '@/workout/plan/plan';
import { scheduleLabel } from '@/workout/plan/schedule';

/**
 * The authored calendar: filled training days, outlined recovery days. With `onFlip` (Your numbers) the
 * days are numbered squares, a week to a row, and a tap switches one between workout and rest.
 */
export function SchedulePreview({
  challenge,
  onFlip,
}: {
  challenge: Challenge;
  onFlip?: (day: number) => void;
}) {
  const colors = useColors();
  if (!challenge.schedule) return null;
  const heading = (
    <Text className="font-mono text-xs tracking-widest text-muted">{scheduleLabel(challenge)}</Text>
  );
  if (!onFlip) {
    return (
      <View
        className="gap-3"
        accessible
        accessibilityLabel={`${scheduleLabel(challenge)}. ${challenge.schedule.map((day, i) => `Day ${i + 1}: ${day}`).join('. ')}`}
      >
        {heading}
        <View className="flex-row flex-wrap gap-1.5">
          {challenge.schedule.map((day, i) => (
            <View
              key={i}
              className={`size-3 rounded-sm ${day === 'rest' ? 'border border-muted' : 'bg-accent'}`}
            />
          ))}
        </View>
        <Text className="font-sans text-sm text-muted">
          Filled days are workouts. Outlined days are rest.
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-3">
      {heading}
      <View className="-m-0.5 flex-row flex-wrap">
        {challenge.schedule.map((day, i) => (
          // A seventh of the row each, so a row is a week from day 1.
          <View key={i} className="aspect-square p-0.5" style={{ width: `${100 / 7}%` }}>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={`Day ${i + 1} workout`}
              accessibilityState={{ checked: day === 'training' }}
              onPress={() => {
                tick();
                onFlip(i);
              }}
              // Colours through `style`: a changing class list remounts the view (react-native-css).
              className="flex-1 items-center justify-center rounded-lg border"
              style={{
                borderColor: day === 'rest' ? colors.muted : colors.accent,
                backgroundColor: day === 'rest' ? undefined : colors.accent,
              }}
            >
              <Text
                className="font-mono text-xs"
                style={{ color: day === 'rest' ? colors.muted : colors.ink }}
              >
                {i + 1}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Text className="font-sans text-sm text-muted">
        Filled days are workouts. Tap a day to make it a workout or rest.
      </Text>
    </View>
  );
}
