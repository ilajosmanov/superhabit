import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useColors } from '@/components/colors';
import { tick } from '@/components/tick';
import { depthText, past, type Gauge } from '@/lib/depth';
import type { Attempt } from '@/workout/plan/results';

const HEIGHT = 112;
/** The narrowest a column gets, a full 48dp touch target: past that the chart scrolls sideways. */
const COLUMN = 48;
const GAP = 6;
const MAX_BAR = 24;

/**
 * A set's attempts as bars, each as deep as it went (accent clean, warn no-rep), scaled to the set's
 * deepest so deeper is always taller, the dashed line where a rep counts. A few fill the width; many scroll sideways from rep 1. Each bar is a button: `onSelect`
 * picks its rep, and the others dim while one is picked.
 */
export function RepChart({
  attempts,
  gauge,
  selected,
  onSelect,
}: {
  attempts: readonly Attempt[];
  gauge: Gauge;
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const column = Math.max(COLUMN, attempts.length ? width / attempts.length : 0);
  const bar = Math.min(MAX_BAR, column - GAP);
  const content = Math.max(width, column * attempts.length);
  // The chart's floor is this set's deepest rep (at least 25 % past the line), so a deeper rep is always a
  // taller bar; the live gauge stops at 25 % past, which drew 82° and 91° squats alike.
  const reach = Math.max(
    1.25,
    ...attempts.map(({ depth }) => (depth === null ? 0 : past(depth, gauge))),
  );
  const tall = (depth: number) => (Math.max(0, past(depth, gauge)) / reach) * HEIGHT;
  const line = HEIGHT - tall(gauge.down);
  return (
    <View
      className="border-b border-line"
      style={{ height: HEIGHT }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row" style={{ width: content, height: HEIGHT }}>
            {/* The dashed line where a rep counts. A View's dashed border, clipped to its top edge:
                Android draws dashes reliably only when all four sides match. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: line,
                width: content,
                height: 1,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 4,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.chalk,
                  opacity: 0.6,
                }}
              />
            </View>
            {attempts.map(({ depth, counted, cue }, i) => (
              <Pressable
                // Attempts never change while the sheet is open.
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`Rep ${i + 1}, ${depth === null ? '' : `${depthText(depth)}, `}${counted ? 'counted' : `not counted${cue ? `: ${cue}` : ''}`}`}
                accessibilityState={{ selected: selected === i }}
                onPress={() => {
                  tick();
                  onSelect(i);
                }}
                className="items-center justify-end"
                style={{ width: column, height: HEIGHT }}
              >
                <View
                  className="rounded-t-sm"
                  style={{
                    width: bar,
                    height: Math.max(2, depth === null ? 0 : tall(depth)),
                    backgroundColor: counted ? colors.accent : colors.warn,
                    opacity: selected === null || selected === i ? 1 : 0.35,
                  }}
                />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
