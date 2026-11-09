import '@/global.css';

import { useMachine } from '@xstate/react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { startup } from '@/bootstrap/startup';
import { Today } from '@/bootstrap/today';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { colors } from '@/theme';
import { RecoverPrompt } from '@/workout/components/recover-prompt';

// Called at load, before anything renders, so the splash stays up until `startup` hides it.
void SplashScreen.preventAutoHideAsync();

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
  const [state, send] = useMachine(startup);
  const recovery = state.children.recovery;
  return (
    // Gesture handler's gestures (the day strip's drag) only run under this root.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ground }}>
      {/* After a failure the error stays up, its button off while Retry runs. */}
      {state.context.error !== '' && !state.matches('ready') && !recovery ? (
        <Screen
          title="Couldn't open your data"
          intro={state.context.error}
          footer={
            <PrimaryButton
              label={state.matches('failed') ? 'Retry' : 'Trying again…'}
              disabled={!state.matches('failed')}
              onPress={() => send({ type: 'retry' })}
            />
          }
        />
      ) : null}
      {/* A workout left open is offered back before anything else shows. */}
      {recovery && <RecoverPrompt recovery={recovery} />}
      {/* No screen renders before the database is ready. Native stack and system back. Screens draw
          their own headers. A pushed page slides fully over the one below: Android's default
          cross-fades the two, which ghosts one page through the other. */}
      {state.matches('ready') && (
        <Today value={state.context.today}>
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
        </Today>
      )}
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}
