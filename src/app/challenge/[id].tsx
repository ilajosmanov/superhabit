import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CHALLENGES, detail, summary } from '@/challenges/challenges';
import { HoldToStart } from '@/challenges/components/hold-to-start';
import { SetBars } from '@/challenges/components/set-bars';
import { Screen } from '@/components/screen';
import { PhoneSetup } from '@/workout/components/phone-setup';

/** What a challenge asks for and how to set up the phone, then Start opens the camera run. */
export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const challenge = CHALLENGES.get(id);
  if (!challenge) return <Screen title="Not found" />;

  const { sets, total, countsReps, tracking, phone, first } = detail(challenge);
  const finite = Number.isFinite(total);

  return (
    <Screen
      title={challenge.name}
      footer={
        <HoldToStart onStart={() => router.push({ pathname: '/workout/[id]', params: { id } })} />
      }
    >
      <Text className="-mt-5 font-mono text-xs tracking-widest text-muted">
        {sets.length} {sets.length === 1 ? 'SET' : 'SETS'} · PHONE {phone}
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
