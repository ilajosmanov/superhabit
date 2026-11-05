import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { CHALLENGES } from '@/pose/exercises';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-ground">
      <Text className="font-sans text-4xl font-light tracking-tight text-chalk">Hello World</Text>
      <View className="mt-6 items-center gap-4">
        {[...CHALLENGES].map(([id, { name }]) => (
          <Link
            key={id}
            href={{ pathname: '/[challenge]', params: { challenge: id } }}
            className="font-sans text-lg text-accent"
          >
            {`${name} →`}
          </Link>
        ))}
      </View>
    </View>
  );
}
