import { Text, useWindowDimensions, View } from 'react-native';

import { JoinedCard } from './joined-card';
import { SurpriseCard } from './surprise-card';
import { SwipeRow } from './swipe-row';
import { toEntry } from '@/challenges/catalog';
import type { Active } from '@/challenges/mine';

/**
 * The challenges you joined, due today first, then the surprise card, in a swipe row where the next
 * card's edge shows. Nothing joined: the surprise card alone.
 */
export function YourChallenges({ active: joined }: { active: readonly Active[] }) {
  const { width } = useWindowDimensions();
  // 24px of the next card shows at the right edge.
  const card = width - 48 - 24;

  if (joined.length === 0) return <SurpriseCard />;
  return (
    <View className="gap-3">
      <View className="flex-row justify-between">
        <Text className="font-mono uppercase text-xs tracking-widest text-muted">yours</Text>
        {joined.length > 1 && (
          <Text className="font-mono uppercase text-xs tracking-widest text-muted">
            {joined.length} active
          </Text>
        )}
      </View>
      <SwipeRow itemWidth={card}>
        {joined.map(({ id, challenge, run }) => (
          <JoinedCard key={id} run={run} entry={toEntry(id, challenge)} style={{ width: card }} />
        ))}
        <SurpriseCard style={{ width: card }} />
      </SwipeRow>
    </View>
  );
}
