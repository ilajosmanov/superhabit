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
      >
        {/* Pushed pages get the platform toolbar: the system back arrow, untitled (the page draws its own title). */}
        <Stack.Screen
          name="challenge/[id]"
          options={{
            headerShown: true,
            title: '',
            headerTintColor: colors.chalk,
            headerStyle: { backgroundColor: colors.ground },
            headerShadowVisible: false,
          }}
        />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
