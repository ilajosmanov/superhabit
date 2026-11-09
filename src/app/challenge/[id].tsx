import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { ChallengePreview } from '@/challenges/components/challenge-preview';
import { HoldToStart } from '@/challenges/components/hold-to-start';
import { JoinedChallenge } from '@/challenges/components/joined-challenge';
import { LeaveButton } from '@/challenges/components/leave-button';
import { saveFailed } from '@/components/save-failed';
import { join } from '@/challenges/library';
import { useLibrary } from '@/challenges/library-live';
import { challengePage } from '@/challenges/library-view';
import { doneToday } from '@/challenges/run-view';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useToday } from '@/bootstrap/today';

/**
 * A challenge. Not running: the preview teaches it, and a tap joins it from today (again, once a run is
 * over). Running: how each day went, and hold to start today's session; the pencil in the toolbar edits
 * one you made. The red disc in the footer leaves the run. A plan from a newer app asks for an update.
 */
export default function ChallengeDetailScreen() {
  const { id, run } = useLocalSearchParams<{ id: string; run?: string }>();
  const router = useRouter();
  const library = useLibrary();
  const day = useToday();
  if (library.loading) return <Screen />;
  const page = challengePage(library, id, day, run);
  if (!page) return <Screen title="Not found" />;

  const { challenge, joined, runId } = page;
  if (!challenge) {
    return (
      <Screen title={page.name} footer={runId && <LeaveButton runId={runId} />}>
        <Text className="-mt-5 font-mono text-xs tracking-widest text-muted">
          UPDATE THE APP TO DO THIS CHALLENGE
        </Text>
      </Screen>
    );
  }
  return (
    <Screen
      title={challenge.name}
      footer={
        <View className="flex-row gap-3">
          {joined && <LeaveButton runId={joined.runId} />}
          <View className="flex-1">
            {joined ? (
              <HoldToStart
                again={doneToday(joined.run)}
                onStart={() =>
                  router.push({ pathname: '/workout/[id]', params: { id: joined.runId } })
                }
              />
            ) : (
              <PrimaryButton
                label={page.ranBefore ? 'Start again' : 'Join'}
                onPress={() => join(id) ?? saveFailed()}
              />
            )}
          </View>
        </View>
      }
    >
      <Stack.Screen
        options={{
          headerRight: page.editable
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
      {joined ? (
        // A new run (a restart, an edit to its days) starts back on today.
        <JoinedChallenge
          key={`${joined.run.id}:${joined.run.from}:${joined.run.days}`}
          joined={joined}
        />
      ) : (
        <>
          <Text className="-mt-5 font-mono text-xs tracking-widest text-muted">{page.status}</Text>
          <ChallengePreview challenge={challenge} />
        </>
      )}
    </Screen>
  );
}
