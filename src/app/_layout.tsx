import '@/global.css';

import { useMachine } from '@xstate/react';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ConsentScreen } from '@/account/components/consent-screen';
import { SignInScreen } from '@/account/components/sign-in-screen';
import { startup } from '@/bootstrap/startup';
import { LeftOpen } from '@/bootstrap/left-open';
import { Leave } from '@/bootstrap/leave';
import { Today } from '@/bootstrap/today';
import { LibraryProvider } from '@/challenges/library-live';
import { DroppedBarScene } from '@/components/illustrations';
import { PrimaryButton } from '@/components/primary-button';
import { GUTTER, Screen } from '@/components/screen';
import { TextButton } from '@/components/text-button';
import { Waiting } from '@/components/waiting';
import { db } from '@/storage/database';
import { colors } from '@/theme';
import { RecoverPrompt } from '@/workout/components/recover-prompt';

// Called at load, before anything renders, so the splash stays up until `startup` hides it.
void SplashScreen.preventAutoHideAsync();

// A deep link straight to a pushed page still has the tabs under it, so back and dismissAll lead home.
export const unstable_settings = { anchor: '(tabs)' };

const FADE_IN = FadeIn.duration(300);
const FADE_OUT = FadeOut.duration(300);

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
  const consent = state.children.consent;
  return (
    // Gesture handler's gestures (the day strip's drag) only run under this root.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ground }}>
      {/* A workout left open is offered back before anything else shows. */}
      {recovery && <RecoverPrompt recovery={recovery} />}
      {/* No screen renders before the database is ready and read. Native stack and system back. Screens draw
          their own headers. A pushed page slides fully over the one below: Android's default
          cross-fades the two, which ghosts one page through the other. */}
      {(state.matches('reading') || state.matches('recovering') || state.matches('ready')) && (
        <Leave
          value={{
            signOut: () => send({ type: 'signOut' }),
            deleted: () => send({ type: 'deleted' }),
            sessionEnded: () => send({ type: 'sessionEnded' }),
          }}
        >
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
        </Leave>
      )}
      {/* After signing in, until Home is laid out (your account may be coming back from the server):
          under the sign-in and consent screens, so they fade out onto it, and it fades out onto Home. */}
      {state.context.splashHidden &&
        (['seeding', 'restoring', 'checking', 'reading'] as const).some((step) =>
          state.matches(step),
        ) && (
          <Animated.View style={StyleSheet.absoluteFill} exiting={FADE_OUT}>
            <Waiting exercise="squat" text="Warming up" />
          </Animated.View>
        )}
      {/* First launch, or the server ended the session: sign in before anything else. Over the screens, so
          each fades into the next instead of cutting: the question out over the app appearing below. */}
      {signIn && (
        <Animated.View style={StyleSheet.absoluteFill} entering={FADE_IN} exiting={FADE_OUT}>
          <SignInScreen signIn={signIn} />
        </Animated.View>
      )}
      {/* Then, when this phone has no answer for the current privacy policy: share your traces? */}
      {consent && (
        <Animated.View style={StyleSheet.absoluteFill} entering={FADE_IN} exiting={FADE_OUT}>
          <ConsentScreen consent={consent} onSignIn={() => send({ type: 'sessionEnded' })} />
        </Animated.View>
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

/**
 * A screen threw while rendering: said kindly instead of closing the app, never with the error itself. Try
 * again renders the app afresh.
 */
// shortcut: the error is only shown, not reported; add crash reporting once the owner picks a service.
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  // The error may come before Home, under the splash; hiding it twice does nothing.
  SplashScreen.hide();
  const { width } = useWindowDimensions();
  return (
    <>
      <Screen
        label="SUPERHABIT"
        footer={
          <View className="gap-2">
            <PrimaryButton label="Try again" onPress={() => void retry()} />
            <View className="items-center">
              {/* shortcut: does nothing yet; the owner wires it to sending feedback later. */}
              <TextButton label="Send feedback" icon="feedback" onPress={() => {}} />
            </View>
          </View>
        }
      >
        <View className="gap-8 pt-2">
          <DroppedBarScene width={width - 2 * GUTTER} />
          <View className="gap-3">
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
              className="font-sans text-5xl font-extralight leading-tight tracking-tighter text-chalk"
            >
              We dropped the bar
            </Text>
            <Text className="font-sans text-base leading-normal text-soft">
              Something broke on our side, not yours. Your sets are safe on this phone.
            </Text>
          </View>
        </View>
      </Screen>
      <StatusBar style="light" />
    </>
  );
}

// Dev builds only (the plugin is a no-op in production): shift+m in the Expo CLI opens Drizzle Studio.
function DrizzleStudio() {
  useDrizzleStudio(db().$client);
  return null;
}
