import { Text, useWindowDimensions, View } from 'react-native';

import { JoinedCard } from './joined-card';
import { SurpriseCard } from './surprise-card';
import { SwipeRow } from './swipe-row';
import { UnavailableCard } from './unavailable-card';
import { toEntry } from '@/challenges/catalog';
import type { Yours } from '@/challenges/library-view';
import { GUTTER } from '@/components/screen';

/**
 * The challenges you joined, due today first, then the surprise card, in a swipe row where the next
 * card's edge shows. Nothing joined: the surprise card alone.
 */
export function YourChallenges({ joined }: { joined: readonly Yours[] }) {
  const { width } = useWindowDimensions();
  // 24px of the next card shows at the right edge.
  const card = width - 2 * GUTTER - 24;

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
        {joined.map((entry) =>
          entry.challenge ? (
            <JoinedCard
              key={entry.runId}
              run={entry.run}
              entry={toEntry(entry.challengeId, entry.challenge)}
              style={{ width: card }}
            />
          ) : (
            <UnavailableCard key={entry.runId} entry={entry} style={{ width: card }} />
          ),
        )}
        <SurpriseCard style={{ width: card }} />
      </SwipeRow>
    </View>
  );
}
