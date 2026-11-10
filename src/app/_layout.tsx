import '@/global.css';

import { useMachine } from '@xstate/react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SignInScreen } from '@/account/components/sign-in-screen';
import { startup } from '@/bootstrap/startup';
import { LeftOpen } from '@/bootstrap/left-open';
import { Today } from '@/bootstrap/today';
import { LibraryProvider } from '@/challenges/library-live';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { db } from '@/storage/database';
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
  const signIn = state.children.signIn;
  return (
    // Gesture handler's gestures (the day strip's drag) only run under this root.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ground }}>
      {/* First launch, or the server ended the session: sign in before anything else. */}
      {signIn && <SignInScreen signIn={signIn} />}
      {/* A workout left open is offered back before anything else shows. */}
      {recovery && <RecoverPrompt recovery={recovery} />}
      {/* No screen renders before the database is ready and read. Native stack and system back. Screens draw
          their own headers. A pushed page slides fully over the one below: Android's default
          cross-fades the two, which ghosts one page through the other. */}
      {(state.matches('reading') || state.matches('recovering') || state.matches('ready')) && (
        <LeftOpen value={state.context.open?.id ?? null}>
          <Today value={state.context.today}>
            <LibraryProvider onRead={(error) => send({ type: 'dataReady', error })}>
              <DrizzleStudio />
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
            </LibraryProvider>
          </Today>
        </LeftOpen>
      )}
      {/* After a failure the error stays up, its button off while Retry runs. */}
      {state.context.error !== '' && !state.matches('ready') && !recovery ? (
        // Over the screens a Retry mounts again while they read.
        <View style={StyleSheet.absoluteFill}>
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
        </View>
      ) : null}

      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

// Dev builds only (the plugin is a no-op in production): shift+m in the Expo CLI opens Drizzle Studio.
function DrizzleStudio() {
  useDrizzleStudio(db().$client);
  return null;
}
