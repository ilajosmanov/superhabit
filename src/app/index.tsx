import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-slate-950">
      <Text className="text-3xl font-semibold text-slate-950 dark:text-white">Hello World</Text>
      <Link href="/squat" className="mt-6 text-lg text-amber-500">
        Squat test →
      </Link>
    </View>
  );
}
