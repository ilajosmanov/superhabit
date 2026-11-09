import { Link } from 'expo-router';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { colors } from '@/theme';
import type { Unavailable } from '@/challenges/library-view';

/** A run of a challenge from a newer app: it can't be shown or started until the app is updated. */
export function UnavailableCard({ entry, style }: { entry: Unavailable; style?: ViewStyle }) {
  return (
    // The wrapper clips the ripple to the card's corners.
    <View className="overflow-hidden rounded-3xl border border-line" style={style}>
      <Link
        href={{ pathname: '/challenge/[id]', params: { id: entry.challengeId, run: entry.runId } }}
        asChild
      >
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${entry.name}, update the app to do it`}
          android_ripple={{ color: colors.line }}
          className="grow gap-5 p-5"
        >
          <View className="flex-row items-center justify-between">
            <Text className="font-mono text-xs tracking-widest text-muted">UPDATE THE APP</Text>
            <Icon name="arrow_forward" size={20} />
          </View>
          <Text className="font-sans text-3xl font-light leading-none tracking-tight text-chalk">
            {entry.name}
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}
