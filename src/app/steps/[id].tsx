import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StepLines } from '@/workout/components/exercise-stack';
import { catalogEntry } from '@/workout/mock-catalog';

/** A challenge's full day, opened from (i) on its card: every step, rounds and rest. */
export default function StepsSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bottom } = useSafeAreaInsets();
  const entry = catalogEntry(id);
  if (!entry) return null;

  return (
    <View className="gap-6 px-6 pt-8" style={{ paddingBottom: bottom + 24 }}>
      <View className="gap-2">
        <Text className="font-mono text-xs tracking-widest text-muted">
          EVERY DAY · {entry.days} DAYS
        </Text>
        <Text
          accessibilityRole="header"
          className="font-sans text-3xl font-light tracking-tight text-chalk"
        >
          {entry.name}
        </Text>
      </View>
      <StepLines entry={entry} />
    </View>
  );
}
