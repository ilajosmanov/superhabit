import '@/global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <>
      {/* Native stack: platform push animations and system back. Screens draw their own headers. */}
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}
      />
      <StatusBar style="light" />
    </>
  );
}
