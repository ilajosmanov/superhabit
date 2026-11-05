import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-ground">
      <Text className="font-sans text-4xl font-light tracking-tight text-chalk">Hello World</Text>
      <Link href="/squat" className="mt-6 font-sans text-lg text-accent">
        Squat test →
      </Link>
    </View>
  );
}
