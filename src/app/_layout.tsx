import '@/global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';

// A deep link straight to a pushed page still has the tabs under it, so back and dismissAll lead home.
export const unstable_settings = { anchor: '(tabs)' };

// Pushed pages get the platform toolbar: the system back arrow, untitled (the page draws its own title).
const pushed = {
  headerShown: true,
  title: '',
  headerTintColor: colors.chalk,
  headerStyle: { backgroundColor: colors.ground },
  headerShadowVisible: false,
} as const;

export default function RootLayout() {
  return (
    <>
      {/* Native stack and system back. Screens draw their own headers. A pushed page slides fully over
          the one below: Android's default cross-fades the two, which ghosts one page through the other. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.ground },
          animation: 'ios_from_right',
        }}
      >
        <Stack.Screen name="challenge/[id]" options={pushed} />
        <Stack.Screen name="create" options={pushed} />
        <Stack.Screen name="build" options={pushed} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
