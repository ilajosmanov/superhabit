import { useSelector } from '@xstate/react';
import type { AndroidSymbol } from 'expo-symbols';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ActorRefFrom } from 'xstate';

import type { consent } from '@/account/consent';
import { Icon } from '@/components/icon';
import { PrimaryButton } from '@/components/primary-button';
import { TextButton } from '@/components/text-button';
import { colors } from '@/theme';

/** Right after the first sign-in (board 22b): share your traces? What goes, what stays, how to stop. */
export function ConsentScreen({ consent: actor }: { consent: ActorRefFrom<typeof consent> }) {
  const { top, bottom } = useSafeAreaInsets();
  const asking = useSelector(actor, (s) => s.matches('asking') || s.matches('saving'));
  const busy = useSelector(actor, (s) => s.matches('saving') || s.matches('failing'));
  const error = useSelector(actor, (s) => s.context.error);
  // Reading what the server has: the ground alone, for the moment it takes.
  if (!asking && !busy) return <View className="flex-1 bg-ground" />;
  return (
    // The question comes in softly once the server's answer is read.
    <Animated.View
      entering={FadeIn.duration(300)}
      style={{ flex: 1, backgroundColor: colors.ground }}
    >
      <View className="px-6" style={{ paddingTop: top + 20 }}>
        <View className="h-11 flex-row items-center border-b border-line">
          <Text className="font-mono text-xs tracking-widest text-muted">SUPERHABIT</Text>
        </View>
      </View>

      {/* Scrolls when the text is larger than the screen holds; the buttons stay put. */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-8 px-6 pb-6 pt-8"
      >
        <View className="gap-4">
          <Text className="font-mono text-xs tracking-widest text-accent">ONE QUESTION</Text>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
            className="font-sans text-5xl font-extralight leading-tight tracking-tighter text-chalk"
          >
            Train the coach with us
          </Text>
          <Text className="font-sans text-lg leading-normal text-soft">
            Every rep you share helps Superhabit see form more clearly, for you and everyone who
            trains with it.
          </Text>
        </View>
        <View className="gap-6 border-t border-line pt-6">
          <Point
            icon="scatter_plot"
            color={colors.accent}
            title="What you share"
            text="The points the camera tracks on your body, rep by rep."
          />
          <Point
            icon="videocam_off"
            title="What stays here"
            text="Videos and photos of you. They never leave this phone."
          />
          <Point
            icon="toggle_off"
            title="Yours to stop"
            text="Turn it off in your profile, and what you've shared is deleted."
          />
        </View>
      </ScrollView>

      <View className="gap-2 px-4" style={{ paddingBottom: bottom + 24 }}>
        {error && (
          <View
            accessibilityLiveRegion="polite"
            className="mb-2 flex-row items-center justify-center gap-2"
          >
            <Icon name={error === 'offline' ? 'wifi_off' : 'error'} size={20} color={colors.warn} />
            <Text className="font-sans text-base text-chalk">
              {error === 'offline'
                ? 'No internet. Try again, or choose later in your profile.'
                : "Couldn't save it. Try again."}
            </Text>
          </View>
        )}
        <PrimaryButton
          label={busy ? 'Saving…' : 'Share my reps'}
          disabled={busy}
          onPress={() => actor.send({ type: 'agree' })}
        />
        <View className="items-center">
          <TextButton label="Not now" onPress={() => actor.send({ type: 'notNow' })} />
        </View>
        <Text className="text-center font-sans text-sm text-muted">
          Change your mind anytime in your profile.
        </Text>
      </View>
    </Animated.View>
  );
}

function Point({
  icon,
  color = colors.muted,
  title,
  text,
}: {
  icon: AndroidSymbol;
  color?: string;
  title: string;
  text: string;
}) {
  return (
    <View accessible className="flex-row items-start gap-4">
      <View className="pt-0.5">
        <Icon name={icon} color={color} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-sans text-lg text-chalk">{title}</Text>
        <Text className="font-sans text-base leading-snug text-muted">{text}</Text>
      </View>
    </View>
  );
}
