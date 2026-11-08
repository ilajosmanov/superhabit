import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { SUGGESTED } from '@/challenges/challenges';
import { ChallengePreview } from '@/challenges/components/challenge-preview';
import { HoldToStart } from '@/challenges/components/hold-to-start';
import { JoinedChallenge } from '@/challenges/components/joined-challenge';
import { LeaveButton } from '@/challenges/components/leave-button';
import { saveFailed } from '@/challenges/components/save-failed';
import { doneToday } from '@/challenges/days';
import { draftOf } from '@/challenges/draft';
import { join, useChallenge } from '@/challenges/mine';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';

/**
 * A challenge. Not running: the preview teaches it, and a tap joins it from today (again, once a run is
 * over). Running: how each day went, and hold to start today's session; the pencil in the toolbar edits
 * it. The red disc in the footer leaves any challenge you are in.
 */
export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const found = useChallenge(id);
  if (!found) return <Screen title="Not found" />;

  const { challenge, saved, run } = found;
  const status = `${!saved && SUGGESTED.has(id) ? 'SUGGESTED · ' : ''}${
    challenge.days === 1 ? 'ONE GO' : `${challenge.days} DAYS · DAY 1 IS TODAY`
  }`;

  return (
    <Screen
      title={challenge.name}
      footer={
        <View className="flex-row gap-3">
          {saved && <LeaveButton id={saved.id} />}
          <View className="flex-1">
            {run ? (
              <HoldToStart
                again={doneToday(run)}
                onStart={() => router.push({ pathname: '/workout/[id]', params: { id } })}
              />
            ) : (
              <PrimaryButton
                label={saved ? 'Start again' : 'Join'}
                onPress={() => join(id, challenge) || saveFailed()}
              />
            )}
          </View>
        </View>
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
      {run && saved ? (
        // A new run (a restart, an edit to its days) starts back on today.
        <JoinedChallenge key={`${run.from}:${run.days}`} saved={saved} run={run} />
      ) : (
        <>
          <Text className="-mt-5 font-mono text-xs tracking-widest text-muted">{status}</Text>
          <ChallengePreview challenge={challenge} />
        </>
      )}
    </Screen>
  );
}
