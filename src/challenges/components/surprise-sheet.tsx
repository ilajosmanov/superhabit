import { BottomSheet, RNHostView, ScrollView } from '@expo/ui';
import { Pressable, Text, View } from 'react-native';

import { capitalise } from '@/challenges/challenges';
import { Glyph } from '@/components/glyph';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { colors, lit } from '@/theme';

/**
 * What the surprise card picked, before the camera opens: the exercise, what counts, where the phone
 * goes. The platform sheet (Material 3 on Android) with our own views inside.
 */
export function SurpriseSheet({
  open,
  exercise: id,
  onDismiss,
  onStart,
}: {
  open: boolean;
  exercise: ExerciseId;
  onDismiss: () => void;
  onStart: () => void;
}) {
  const exercise = EXERCISES[id];
  return (
    <BottomSheet
      isPresented={open}
      onDismiss={onDismiss}
      containerColor={colors.surface}
      contentPadding={0}
    >
      {/* Scrolls only when large text outgrows the screen, so Start stays reachable. */}
      <ScrollView>
        {/* Width from the sheet, height from the views, so the text wraps and the sheet fits it. */}
        <RNHostView matchContents={{ vertical: true }}>
          <View className="gap-6 px-6 pb-6 pt-2">
            <View className="gap-4">
              <Text className="font-mono text-xs tracking-widest text-muted">
                SURPRISE · ONE GO
              </Text>
              <View className="flex-row items-center gap-4">
                <View className="size-16 items-center justify-center rounded-2xl border border-edge bg-ground">
                  <Glyph d={exercise.glyph} size={36} box={32} />
                </View>
                <Text
                  accessibilityRole="header"
                  className="flex-1 font-sans text-4xl font-light tracking-tight text-chalk"
                >
                  {capitalise(exercise.name)}
                </Text>
              </View>
            </View>

            <Text className="font-sans text-base leading-normal text-soft">
              {exercise.kind === 'hold'
                ? 'One hold, as long as you can. The camera times it.'
                : 'One set, as many clean reps as you can. The camera counts them.'}{' '}
              Just this once: nothing to keep up tomorrow.
            </Text>

            <Text className="font-mono text-xs tracking-widest text-muted">
              {exercise.place.toUpperCase()}
            </Text>

            <View className="overflow-hidden rounded-full">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Start ${exercise.name}`}
                // Ground at 16 %, like HoldToStart's fill; the wrapper clips it to the pill.
                android_ripple={{ color: 'rgba(13,14,11,0.16)' }}
                onPress={onStart}
                className="h-15 items-center justify-center bg-accent"
                style={lit}
              >
                <Text className="font-sans text-lg font-semibold tracking-tight text-ground">
                  Start
                </Text>
              </Pressable>
            </View>
          </View>
        </RNHostView>
      </ScrollView>
    </BottomSheet>
  );
}
