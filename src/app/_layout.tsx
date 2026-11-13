// First: Sentry starts before any other module runs.
import '@/bootstrap/crash-reports';
// Then the theme you chose, before the first frame.
import '@/bootstrap/appearance';
import '@/global.css';

import * as Sentry from '@sentry/react-native';
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
import { CrashFeedback } from '@/bootstrap/components/crash-feedback';
import { startup } from '@/bootstrap/startup';
import { LeftOpen } from '@/bootstrap/left-open';
import { Leave } from '@/bootstrap/leave';
import { Today } from '@/components/today';
import { StreakProvider } from '@/streak/streak-live';
import { VideosProvider } from '@/challenges/videos-live';
import { LibraryProvider } from '@/challenges/library-live';
import { DroppedBarScene } from '@/components/illustrations';
import { SnackbarProvider } from '@/components/snackbar';
import { PrimaryButton } from '@/components/primary-button';
import { GUTTER, Screen } from '@/components/screen';
import { Waiting } from '@/components/waiting';
import { db } from '@/storage/database';
import { useColors } from '@/components/colors';
import { dark } from '@/theme';
import { RecoverPrompt } from '@/workout/components/recover-prompt';

// Called at load, before anything renders, so the splash stays up until `startup` hides it.
void SplashScreen.preventAutoHideAsync();

// A deep link straight to a pushed page still has the tabs under it, so back and dismissAll lead home.
export const unstable_settings = { anchor: '(tabs)' };

const FADE_IN = FadeIn.duration(300);
const FADE_OUT = FadeOut.duration(300);

// Wrapped: Sentry's touch and render tracking need the root.
export default Sentry.wrap(RootLayout);

function RootLayout() {
  const colors = useColors();
  const [state, send] = useMachine(startup);
  const recovery = state.children.recovery;
  const signIn = state.children.signIn;
  const consent = state.children.consent;
  // Pushed pages get the platform toolbar: the system back arrow, untitled (the page draws its own title).
  const pushed = {
    headerShown: true,
    title: '',
    headerTintColor: colors.chalk,
    headerStyle: { backgroundColor: colors.ground },
    headerShadowVisible: false,
    // iOS: the chevron alone, not the previous route's name ("(tabs)").
    headerBackButtonDisplayMode: 'minimal',
  } as const;
  return (
    // Gesture handler's gestures (the day strip's drag) only run under this root.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ground }}>
      <SnackbarProvider>
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
                  <StreakProvider>
                    <VideosProvider>
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
                        <Stack.Screen name="tune" options={pushed} />
                        {/* The camera stays dark in either theme; only its Done page wears the theme. */}
                        <Stack.Screen
                          name="workout/[id]"
                          options={{ contentStyle: { backgroundColor: dark.ground } }}
                        />
                      </Stack>
                    </VideosProvider>
                  </StreakProvider>
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

        <StatusBar style="auto" />
      </SnackbarProvider>
    </GestureHandlerRootView>
  );
}

/**
 * A screen threw while rendering: said kindly instead of closing the app, never with the error itself, which
 * goes to Sentry (the wrapper reports it with the route). Try again renders the app afresh.
 */
export const ErrorBoundary = Sentry.wrapExpoRouterErrorBoundary(DroppedBar);

function DroppedBar({ retry }: ErrorBoundaryProps) {
  // The error may come before Home, under the splash; hiding it twice does nothing.
  SplashScreen.hide();
  const { width } = useWindowDimensions();
  return (
    <>
      <Screen
        label="REPREPGO"
        footer={
          <View className="gap-2">
            <PrimaryButton label="Try again" onPress={() => void retry()} />
            <CrashFeedback />
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
      <StatusBar style="auto" />
    </>
  );
}

// Dev builds only (the plugin is a no-op in production): shift+m in the Expo CLI opens Drizzle Studio.
function DrizzleStudio() {
  useDrizzleStudio(db().$client);
  return null;
}
