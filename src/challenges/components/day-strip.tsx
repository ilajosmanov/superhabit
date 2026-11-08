import { useRef } from 'react';
import { Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import { addDays, dayLabel, dayWord, type Run } from '@/challenges/days';
import { tick } from '@/components/tick';
import { colors } from '@/theme';

/**
 * Every day of a run as a bar: its height is how much of that day's session you did, and a dot marks
 * today. Tap a bar or drag across them to pick the day the page shows, with a tick per day, like a picker.
 */
export function DayStrip({
  run,
  selected,
  onSelect,
}: {
  run: Run;
  selected: number;
  onSelect: (day: number) => void;
}) {
  const width = useRef(1);
  // The day last picked, so a drag ticks once per day even before the page re-renders.
  const last = useRef(selected);
  const select = (day: number) => {
    const clamped = Math.min(run.days - 1, Math.max(0, day));
    if (clamped === last.current) return;
    last.current = clamped;
    tick();
    onSelect(clamped);
  };
  const pick = (x: number) => select(Math.floor((x / width.current) * run.days));
  const pan = usePanGesture({
    runOnJS: true,
    // Sideways only: a touch that moves up or down first is the page's scroll.
    activeOffsetX: [-8, 8],
    failOffsetY: [-12, 12],
    // On touch down, so a tap picks its day without waiting for a drag.
    onBegin: (e) => {
      // A new touch starts from the page's day: it may have moved on (midnight) since the last pick.
      last.current = selected;
      pick(e.x);
    },
    onUpdate: (e) => pick(e.x),
  });

  const today = run.day - 1;
  const label = `${selected === today ? 'TODAY' : `DAY ${selected + 1}`} · ${dayLabel(addDays(run.from, selected))}`;
  const word = dayWord(run, selected);
  const tried = (run.progress[selected] ?? 0) > 0;
  return (
    <View className="gap-1">
      <View className="flex-row justify-between">
        <Text className="font-mono text-xs tracking-widest text-chalk">{label}</Text>
        <Text
          className="font-mono text-xs tracking-widest"
          style={{ color: tried ? colors.accent : colors.muted }}
        >
          {word}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Days of this challenge"
          accessibilityValue={{ text: `${label}, ${word}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            last.current = selected;
            select(selected + (nativeEvent.actionName === 'increment' ? 1 : -1));
          }}
          onLayout={({ nativeEvent }) => {
            width.current = nativeEvent.layout.width;
          }}
          className="-mx-1 h-13 flex-row"
        >
          {Array.from({ length: run.days }, (_, i) => {
            const on = i === selected;
            return (
              // Days don't reorder.
              <View key={i} className="flex-1 items-center justify-end gap-1.5">
                <View
                  className="overflow-hidden rounded-sm"
                  style={{
                    width: on ? 6 : 4,
                    // Days still ahead are stubs: nothing can fill them yet.
                    height: i < run.day ? 28 : 10,
                    backgroundColor: on ? colors.faint : colors.line,
                  }}
                >
                  <View
                    className="absolute inset-x-0 bottom-0 bg-accent"
                    style={{ height: `${(run.progress[i] ?? 0) * 100}%` }}
                  />
                </View>
                <View
                  className="size-1 rounded-full"
                  style={{ backgroundColor: i === today ? colors.chalk : 'transparent' }}
                />
              </View>
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );
}
