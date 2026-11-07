import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { detail, summary } from '@/challenges/challenges';
import { HoldToStart } from '@/challenges/components/hold-to-start';
import { saveFailed } from '@/challenges/components/save-failed';
import { doneToday } from '@/challenges/days';
import { draftOf } from '@/challenges/draft';
import { join, useChallenge } from '@/challenges/mine';
import { SetBars } from '@/challenges/components/set-bars';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { PhoneSetup } from '@/workout/components/phone-setup';

/**
 * What a challenge asks for and how to set up the phone. Not running: a tap joins it from today (again,
 * once a run is over). Running: hold to start today's set, and the pencil in the toolbar edits it.
 */
export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const found = useChallenge(id);
  if (!found) return <Screen title="Not found" />;

  const { challenge, saved, run } = found;
  const { total, countsReps, tracking, phone, first, sets } = detail(challenge);
  const finite = Number.isFinite(total);
  const status = run
    ? `DAY ${run.day} OF ${run.days}${doneToday(run) ? ' · DONE TODAY' : ''}`
    : `${challenge.days} DAYS · DAY 1 IS TODAY`;

  return (
    <Screen
      title={challenge.name}
      footer={
        run ? (
          <HoldToStart onStart={() => router.push({ pathname: '/workout/[id]', params: { id } })} />
        ) : (
          <PrimaryButton
            label={saved ? 'Start again' : 'Join'}
            onPress={() => join(id, challenge) || saveFailed()}
          />
        )
      }
    >
      <Stack.Screen
        options={{
          headerRight:
            saved && draftOf(challenge)
              ? () => (
                  // A pencil, like the back arrow opposite: a 48dp target. A word in the header
                  // only took taps on its own letters.
                  <IconButton
                    icon="edit"
                    label="Edit challenge"
                    onPress={() => router.push({ pathname: '/build', params: { id } })}
                    style={{ marginRight: -12 }}
                  />
                )
              : undefined,
        }}
      />
      <Text className="-mt-5 font-mono text-xs tracking-widest text-muted">
        {status} · PHONE {phone}
      </Text>

      <View accessible accessibilityLabel={`${summary(challenge)}. ${tracking}`} className="gap-6">
        {/* Clipped so the numeral rises out of its baseline, like the podium steps. */}
        <View className="flex-row items-end justify-between overflow-hidden">
          <Animated.View entering={FadeInDown.duration(500)}>
            <Text className="-ml-1.5 font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk">
              {finite ? total : 'Max'}
            </Text>
          </Animated.View>
          <Text className="pb-4 font-mono text-xs tracking-widest text-muted">
            {countsReps ? 'CLEAN REPS' : 'SECONDS'}
          </Text>
        </View>

        <SetBars sets={sets} finite={finite} countsReps={countsReps} />

        <Text className="font-sans text-sm text-muted">{tracking}</Text>
      </View>

      <View className="gap-4">
        <Text className="font-mono text-xs tracking-widest text-muted">BEFORE YOU START</Text>
        <PhoneSetup exercise={first} />
      </View>
    </Screen>
  );
}
