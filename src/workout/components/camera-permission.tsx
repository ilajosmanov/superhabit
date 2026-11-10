import type { AndroidSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { CameraScene } from '@/components/illustrations';
import { PrimaryButton } from '@/components/primary-button';
import { colors } from '@/theme';

// Each line is a fact of this build: the pose model runs on the phone, and video is filmed without audio.
const FACTS: readonly [AndroidSymbol, string][] = [
  ['accessibility_new', 'It follows your joints and counts only clean reps.'],
  ['lock', 'Reps are counted here, on this phone.'],
  ['mic_off', 'Camera only. Never the microphone.'],
];

// Android's own order, so the steps match what Settings shows.
const STEPS = ['Permissions', 'Camera', 'Allow only while using the app'];

/**
 * Boards 20a and 20b, before a session can start: ask for the camera (Android's dialog follows) or, once
 * it was denied for good, send you to Settings. Coming back re-checks it, so the session then starts.
 */
export function CameraPermission({ canAsk, onAsk }: { canAsk: boolean; onAsk: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <View
      className="flex-1 bg-ground px-4"
      style={{ paddingTop: top + 12, paddingBottom: bottom + 24 }}
    >
      <View className="h-11 flex-row items-center">
        <IconButton icon="close" label="Back" onPress={() => router.back()} />
      </View>
      {/* Scrolls, the button stays: on a 360×780 phone the page is ~40 dp taller than the screen, more
          with a larger font size. */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pt-5 pb-6"
      >
        <CameraScene width={width - 32} off={!canAsk} />
        <View className="mt-9 gap-6 px-2">
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
            className="font-sans text-5xl font-extralight tracking-tighter text-chalk"
          >
            {canAsk ? 'The camera is your referee' : 'The camera is turned off'}
          </Text>
          {canAsk ? (
            <View className="gap-4.5">
              {FACTS.map(([icon, text]) => (
                <View key={icon} className="flex-row items-start gap-3.5">
                  <Icon name={icon} size={22} color={colors.chalk} />
                  <Text className="flex-1 font-sans text-lg leading-snug text-soft">{text}</Text>
                </View>
              ))}
            </View>
          ) : (
            <>
              <Text className="font-sans text-lg leading-snug text-soft">
                Nothing gets counted without it. Android won&apos;t ask again, so turn it on in
                Settings.
              </Text>
              <View className="gap-3">
                {STEPS.map((step, i) => (
                  <View key={step} className="flex-row gap-3">
                    <Text className="w-5 pt-0.5 font-mono text-xs text-muted">{`0${i + 1}`}</Text>
                    <Text className="flex-1 font-sans text-base text-soft">{step}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
      <View className="gap-3.5 pt-4">
        <PrimaryButton onPress={onAsk} label={canAsk ? 'Allow camera' : 'Open settings'} />
        <Text className="text-center font-sans text-sm text-muted">
          {canAsk ? 'Android asks you next.' : 'Come back here and the session starts.'}
        </Text>
      </View>
    </View>
  );
}
