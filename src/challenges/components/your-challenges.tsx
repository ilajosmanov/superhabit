import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { JoinedCard, type Joined } from './joined-card';
import { SurpriseCard } from './surprise-card';
import { catalogEntry } from '@/challenges/catalog';

const GAP = 12;

// Android's segment tick follows the user's touch-feedback setting.
const tick = () =>
  void (Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
    : Haptics.selectionAsync());

// shortcut: the screen passes no progress until joined challenges are stored, so JoinedCard, StepsButton,
// /steps/[id] and catalogEntry are unreached; pass the stored list then.
/**
 * The challenges you joined, due today first, then the surprise card, in a swipe row where the next
 * card's edge shows. Nothing joined: the surprise card alone.
 */
export function YourChallenges({ progress }: { progress: readonly Joined[] }) {
  const { width } = useWindowDimensions();
  // The card the swipe row last ticked on.
  const page = useRef(0);
  const joined = [...progress]
    .sort((a, b) => Number(a.doneToday) - Number(b.doneToday))
    .flatMap((p) => {
      const entry = catalogEntry(p.id);
      return entry ? [{ progress: p, entry }] : [];
    });
  // 24px of the next card shows at the right edge.
  const card = width - 48 - 24;

  if (joined.length === 0) return <SurpriseCard />;
  return (
    <View className="gap-3">
      <View className="flex-row justify-between">
        <Text className="font-mono text-xs tracking-widest text-muted">YOURS</Text>
        {joined.length > 1 && (
          <Text className="font-mono text-xs tracking-widest text-muted">
            {joined.length} ACTIVE
          </Text>
        )}
      </View>
      <ScrollView
        horizontal
        snapToInterval={card + GAP}
        decelerationRate="fast"
        // A detent tick each time the next card takes the slot, mid-swipe, like a picker.
        scrollEventThrottle={16}
        onScroll={(event) => {
          const i = Math.round(event.nativeEvent.contentOffset.x / (card + GAP));
          if (i === page.current) return;
          page.current = i;
          tick();
        }}
        showsHorizontalScrollIndicator={false}
        className="-mx-6"
        contentContainerClassName="gap-3 px-6"
      >
        {joined.map(({ progress, entry }) => (
          <JoinedCard key={entry.id} joined={progress} entry={entry} style={{ width: card }} />
        ))}
        <SurpriseCard style={{ width: card }} />
      </ScrollView>
    </View>
  );
}
