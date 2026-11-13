import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { Text, View } from 'react-native';

import { ChallengePreview } from '@/challenges/components/challenge-preview';
import { ArchiveButton } from '@/challenges/components/archive-button';
import { HoldToStart } from '@/challenges/components/hold-to-start';
import { JoinedChallenge } from '@/challenges/components/joined-challenge';
import { LeaveButton } from '@/challenges/components/leave-button';
import { saveFailed } from '@/components/save-failed';
import { join } from '@/challenges/library';
import { useLibrary } from '@/challenges/library-live';
import { challengePage } from '@/challenges/library-view';
import { doneToday, restingToday } from '@/challenges/run-view';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useToday } from '@/components/today';
import { useColors } from '@/components/colors';

/**
 * A challenge. Not running: the preview teaches it, and a tap joins it from today (again, once a run is
 * over), or Change numbers opens Your numbers first on a suggested one. Running: how each day went,
 * and hold to start today's session; the pencil in the toolbar edits one you made. The red disc in the
 * footer leaves the run. Archive permanently removes your challenge from the library; its page stays
 * readable. A plan from a newer app asks for an update.
 */
export default function ChallengeDetailScreen() {
  const colors = useColors();
  const { id, run } = useLocalSearchParams<{ id: string; run?: string }>();
  const router = useRouter();
  const library = useLibrary();
  const day = useToday();
  // The run Join just started: until the live library has it, Join is still up and a second tap would
  // start another.
  const started = useRef<string | null>(null);
  const page = challengePage(library, id, day, run);
  if (!page) return <Screen title="Not found" />;

  const { challenge, joined, runId } = page;
  const toolbar = (
    <Stack.Screen
      options={{
        headerRight: page.archivable
          ? () => (
              <View className="flex-row items-center">
                {page.editable && (
                  <IconButton
                    icon="edit"
                    label="Edit challenge"
                    onPress={() => router.push({ pathname: '/build', params: { id } })}
                  />
                )}
                <ArchiveButton challengeId={id} />
              </View>
            )
          : undefined,
      }}
    />
  );
  if (page.archived) {
    return (
      <Screen title={page.name}>
        {toolbar}
        <Text className="-mt-5 font-mono text-xs tracking-widest text-muted">ARCHIVED</Text>
        <Text className="font-sans text-base text-soft">
          Your workouts are kept. To do this challenge again, create a new one.
        </Text>
        {challenge ? (
          <ChallengePreview challenge={challenge} />
        ) : (
          <Text className="font-sans text-base text-muted">
            Update the app to view its details.
          </Text>
        )}
      </Screen>
    );
  }
  if (!challenge) {
    return (
      <Screen title={page.name} footer={runId && <LeaveButton runId={runId} />}>
        {toolbar}
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
          {!joined && page.suggested && (
            <IconButton
              icon="tune"
              label="Change numbers"
              fill={colors.line}
              diameter={60}
              onPress={() => router.push({ pathname: '/tune', params: { id } })}
            />
          )}
          {joined && <LeaveButton runId={joined.runId} />}
          <View className="flex-1">
            {joined && restingToday(joined.run) ? (
              <View className="h-15 items-center justify-center">
                <Text className="font-sans text-base text-muted">Rest day · no workout due</Text>
              </View>
            ) : joined ? (
              <HoldToStart
                again={doneToday(joined.run)}
                onStart={() =>
                  router.push({ pathname: '/workout/[id]', params: { id: joined.runId } })
                }
              />
            ) : (
              <PrimaryButton
                label={page.ranBefore ? 'Start again' : 'Join'}
                onPress={() => {
                  const pending = started.current;
                  if (pending && !library.runs.some((r) => r.id === pending)) return;
                  started.current = join(id);
                  // The page follows the new run, not the one over that its link named.
                  if (started.current) router.setParams({ run: started.current });
                  else saveFailed();
                }}
              />
            )}
          </View>
        </View>
      }
    >
      {toolbar}
      {joined ? (
        // A new run (a restart, an edit to its days) starts back on today.
        <JoinedChallenge
          key={`${joined.run.id}:${joined.run.from}:${joined.run.days}`}
          joined={joined}
        />
      ) : (
        <>
          <Text className="-mt-5 font-mono text-xs tracking-widest text-muted">{page.status}</Text>
          {page.guidance && (
            <View className="gap-2">
              <Text className="font-mono text-xs tracking-widest text-muted">
                {page.guidance.group.toUpperCase()}
              </Text>
              <Text className="font-sans text-base text-muted">{page.guidance.description}</Text>
            </View>
          )}
          <ChallengePreview challenge={challenge} />
        </>
      )}
    </Screen>
  );
}
