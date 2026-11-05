import { Text, View } from 'react-native';

/** Big rep count, with "/target" for a finite set. */
export function RepCount({ reps, target }: { reps: number; target: number }) {
  return (
    <View className="flex-row items-end gap-1.5">
      <Text className="font-sans text-8xl font-extralight leading-none text-chalk">{reps}</Text>
      {Number.isFinite(target) && (
        <Text className="pb-2 font-sans text-3xl font-light text-faint">/{target}</Text>
      )}
    </View>
  );
}
