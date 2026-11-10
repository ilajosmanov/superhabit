import { Text, View } from 'react-native';

import { detail, plan } from '@/challenges/challenges';
import { HowItCounts } from './how-it-counts';
import { SessionPlan } from './session-plan';
import type { Challenge } from '@/workout/plan/plan';

/**
 * A challenge before you are in it, the page teaching: what a day asks for, where the phone goes, and
 * how each exercise counts.
 */
export function ChallengePreview({ challenge }: { challenge: Challenge }) {
  const session = plan(challenge);
  const { tracking } = detail(challenge);
  return (
    <>
      <View className="gap-6">
        <SessionPlan plan={session} days={challenge.days} />
        <Text className="font-sans text-sm text-muted">{tracking}</Text>
      </View>

      <HowItCounts exercises={session.exercises} />
    </>
  );
}
