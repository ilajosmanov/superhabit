import { shallowEqual, useSelector } from '@xstate/react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { ActorRefFrom } from 'xstate';

import type { signIn } from '@/account/sign-in';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { colors } from '@/theme';

/** The first launch (board 21a): why the app, and Google's button. Nothing else shows until it's done. */
export function SignInScreen({ signIn: actor }: { signIn: ActorRefFrom<typeof signIn> }) {
  const { top, bottom } = useSafeAreaInsets();
  const busy = useSelector(
    actor,
    (s) =>
      s.matches('signingIn') ||
      s.matches('failing') ||
      // Tapped while the old session ends (Sign out, Keep them): signing in follows.
      (s.matches('forgetting') && s.context.pressed),
  );
  const error = useSelector(actor, (s) => s.context.error);
  const asking = useSelector(
    actor,
    (s) => (s.matches('asking') ? { next: s.context.next, replacing: s.context.replacing } : null),
    shallowEqual,
  );
  return (
    <View className="flex-1 bg-ground">
      <View className="px-6" style={{ paddingTop: top + 20 }}>
        <View className="h-11 flex-row items-center border-b border-line">
          <Text className="font-mono text-xs tracking-widest text-muted">SUPERHABIT</Text>
        </View>
      </View>

      <View className="flex-1 gap-8 pt-6">
        <View className="items-center px-4">
          <Watched />
        </View>
        <View className="gap-4 px-6">
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
            className="font-sans text-5xl font-extralight leading-tight tracking-tighter text-chalk"
          >
            Move better, every day
          </Text>
          <Text className="font-sans text-lg leading-normal text-soft">
            Show up, do the work, and watch your form get sharper with every session.
          </Text>
        </View>
      </View>

      <View className="gap-4 px-4" style={{ paddingBottom: bottom + 24 }}>
        {error && (
          <View
            accessibilityLiveRegion="polite"
            className="flex-row items-center justify-center gap-2"
          >
            <Icon name={error === 'offline' ? 'wifi_off' : 'error'} size={20} color={colors.warn} />
            <Text className="font-sans text-base text-chalk">
              {error === 'offline'
                ? 'No internet. Signing in needs it.'
                : "Couldn't sign in. Try again."}
            </Text>
          </View>
        )}
        <GoogleButton
          busy={busy || asking !== null}
          onPress={() => actor.send({ type: 'press' })}
        />
        {asking?.next && asking.replacing && (
          <ConfirmDialog
            title={`Sign in as ${asking.next.name}?`}
            text={`${asking.replacing}'s workouts and challenges on this phone will be removed. They aren't backed up yet.`}
            action="Sign in"
            cancel="Keep them"
            onConfirm={() => actor.send({ type: 'replace' })}
            onCancel={() => actor.send({ type: 'keepTheirs' })}
          />
        )}
        <Text className="text-center font-sans text-sm leading-normal text-muted">
          {
            'Your name and photo come from Google.\nVideos of you stay on this phone unless you share them.'
          }
        </Text>
      </View>
    </View>
  );
}

/**
 * Google's dark button as its branding asks: the G mark, Roboto Medium, #131314 fill, #8E918F hairline;
 * full width, like our primary.
 */
function GoogleButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <View
      className="h-15 overflow-hidden rounded-full"
      style={{ borderWidth: 1, borderColor: '#8E918F', opacity: busy ? 0.7 : 1 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onPress}
        android_ripple={{ color: 'rgba(227,227,227,0.12)' }}
        className="flex-1 flex-row items-center justify-center gap-3"
        style={{ backgroundColor: '#131314' }}
      >
        {busy ? <ActivityIndicator size="small" color="#E3E3E3" /> : <GoogleMark />}
        <Text style={{ fontFamily: 'Roboto', fontWeight: '500', fontSize: 17, color: '#E3E3E3' }}>
          {busy ? 'Signing in…' : 'Continue with Google'}
        </Text>
      </Pressable>
    </View>
  );
}

/** Google's G, its four colours as published. */
function GoogleMark() {
  return (
    <Svg width={22} height={22} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

/** The phone against the wall, watching you squat: a dot on every joint, the knee's angle in amber. */
function Watched() {
  const { accent, chalk, line, surface } = colors;
  return (
    <Svg
      width={358}
      height={230}
      viewBox="0 0 358 230"
      accessibilityLabel="A phone against a wall, its camera following someone's joints as they squat"
    >
      <Path d="M28 70 321 149 28 210Z" fill={accent} fillOpacity={0.07} />
      <Path
        d="M321 149 28 70M321 149 28 210"
        stroke={accent}
        strokeOpacity={0.55}
        strokeWidth={1.5}
        strokeDasharray="3 6"
        strokeLinecap="round"
      />
      <Path d="M10 210H348M330 30V210" stroke={line} strokeWidth={2} strokeLinecap="round" />
      <G transform="translate(298 209) rotate(25)">
        <Rect
          x={-10}
          y={-74}
          width={20}
          height={74}
          rx={5}
          fill={surface}
          stroke={chalk}
          strokeWidth={2}
        />
      </G>
      <Circle cx={321} cy={149} r={3.5} fill={accent} />
      <G transform="translate(40 101) scale(4.2)" strokeLinecap="round" strokeLinejoin="round">
        <Path
          d="M15 9L12 17L21 18L20 26M14 11.5L24 12"
          stroke={chalk}
          strokeWidth={0.48}
          fill="none"
        />
        <Circle cx={16} cy={6} r={2.6} stroke={chalk} strokeWidth={0.48} fill="none" />
        <Path
          d="M18.02 17.67A3 3 0 0 0 20.63 20.98"
          stroke={accent}
          strokeWidth={0.42}
          fill="none"
        />
        <Circle cx={15} cy={9} r={0.75} fill={chalk} />
        <Circle cx={12} cy={17} r={0.75} fill={chalk} />
        <Circle cx={21} cy={18} r={0.95} fill={accent} />
        <Circle cx={20} cy={26} r={0.75} fill={chalk} />
        <Circle cx={24} cy={12} r={0.75} fill={chalk} />
        <SvgText x={23.4} y={22.6} fill={accent} fontFamily="Geist Mono" fontSize={2.6}>
          90°
        </SvgText>
      </G>
    </Svg>
  );
}
