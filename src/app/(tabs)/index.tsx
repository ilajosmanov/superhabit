import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { CameraTestCard } from '@/workout/components/camera-test-card';
import { Catalog } from '@/workout/components/catalog';
import { JoinedCard } from '@/workout/components/joined-card';
import { Screen } from '@/components/screen';
import { catalogEntry, MOCK_CATALOG } from '@/workout/mock-catalog';
import { MOCK_JOINED, type MockState } from '@/workout/mock-joined';

const GAP = 12;

// Android's segment tick follows the user's touch-feedback setting.
const tick = () =>
  void (Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
    : Haptics.selectionAsync());

/**
 * Nothing joined: the camera test leads, then every challenge as an equal tile.
 * One joined: its card leads. Several: a swipe row where the next card's edge shows.
 */
export default function ChallengesScreen() {
  const { width } = useWindowDimensions();
  const [mock, setMock] = useState<MockState>('none');
  // The card the swipe row last ticked on.
  const page = useRef(0);

  // Due today first, done today last.
  const joined = [...MOCK_JOINED[mock]]
    .sort((a, b) => Number(a.doneToday) - Number(b.doneToday))
    .flatMap((progress) => {
      const entry = catalogEntry(progress.id);
      return entry ? [{ progress, entry }] : [];
    });
  const ids = new Set(joined.map(({ entry }) => entry.id));
  const catalog = MOCK_CATALOG.filter((entry) => !ids.has(entry.id));
  // 24px of the next card shows at the right edge.
  const card = width - 48 - 24;

  return (
    <Screen label="SUPERHABIT" title="Challenges">
      {joined.length === 0 ? (
        <CameraTestCard />
      ) : (
        <View className="gap-3">
          <View className="flex-row justify-between">
            <Text className="font-mono text-xs tracking-widest text-muted">YOURS</Text>
            {joined.length > 1 && (
              <Text className="font-mono text-xs tracking-widest text-muted">
                {joined.length} ACTIVE
              </Text>
            )}
          </View>
          {joined.length === 1 ? (
            <JoinedCard joined={joined[0].progress} entry={joined[0].entry} />
          ) : (
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
                <JoinedCard
                  key={entry.id}
                  joined={progress}
                  entry={entry}
                  style={{ width: card }}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {catalog.length > 0 && (
        <Catalog
          label={joined.length === 0 ? 'OR PICK A CHALLENGE' : 'MORE CHALLENGES'}
          entries={catalog}
        />
      )}

      {__DEV__ && <MockSwitch value={mock} onChange={setMock} />}
    </Screen>
  );
}

// shortcut: dev-only switch between mocked states; delete with mock-joined.ts.
function MockSwitch({ value, onChange }: { value: MockState; onChange: (v: MockState) => void }) {
  return (
    <View className="flex-row items-center gap-2 border-t border-line pt-4">
      <Text className="font-mono text-xs tracking-widest text-subtle">MOCK</Text>
      {(['none', 'one', 'many'] as const).map((state) => (
        <Pressable
          key={state}
          accessibilityRole="button"
          accessibilityState={{ selected: value === state }}
          onPress={() => onChange(state)}
          className={`rounded-full border px-3 py-1.5 ${value === state ? 'border-chalk' : 'border-line'}`}
        >
          <Text className="font-mono text-xs tracking-widest text-chalk">
            {state.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
