import { useRef, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { tick } from '@/components/tick';

const GAP = 12;

/**
 * Cards of one width in a row that runs to the screen edges and snaps card by card, with a detent tick
 * each time the next card takes the slot, mid-swipe, like a picker. Children set their own `itemWidth`.
 */
export function SwipeRow({ itemWidth, children }: { itemWidth: number; children: ReactNode }) {
  // The card the row last ticked on.
  const page = useRef(0);
  return (
    <ScrollView
      horizontal
      snapToInterval={itemWidth + GAP}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={(event) => {
        const i = Math.round(event.nativeEvent.contentOffset.x / (itemWidth + GAP));
        if (i === page.current) return;
        page.current = i;
        tick();
      }}
      showsHorizontalScrollIndicator={false}
      className="-mx-6"
      contentContainerClassName="gap-3 px-6"
    >
      {children}
    </ScrollView>
  );
}
