import { Text, View } from 'react-native';

import type { Challenge } from '@/workout/plan/plan';
import { scheduleLabel } from '@/workout/plan/schedule';

/** The authored calendar before joining: filled training days, outlined recovery days. */
export function SchedulePreview({ challenge }: { challenge: Challenge }) {
  if (!challenge.schedule) return null;
  return (
    <View
      className="gap-3"
      accessible
      accessibilityLabel={`${scheduleLabel(challenge)}. ${challenge.schedule.map((day, i) => `Day ${i + 1}: ${day}`).join('. ')}`}
    >
      <Text className="font-mono text-xs tracking-widest text-muted">
        {scheduleLabel(challenge)}
      </Text>
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
