import { Text, View } from 'react-native';

/** How to place the phone for an exercise: its `place` as a heading, then its numbered steps. */
export function PhoneSetup({
  exercise,
}: {
  exercise: { place: string; steps: readonly string[] };
}) {
  return (
    <View className="gap-4">
      <Text accessibilityRole="header" className="font-sans text-2xl font-light text-chalk">
        {exercise.place}
      </Text>
      <View className="gap-2.5">
        {exercise.steps.map((step, i) => (
          <View key={step} className="flex-row gap-3">
            <Text className="w-5 pt-0.5 font-mono text-xs text-muted">{`0${i + 1}`}</Text>
            <Text className="flex-1 font-sans text-base text-soft">{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
