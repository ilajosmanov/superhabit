import { useLocalSearchParams, useRouter } from 'expo-router';

import { useLeftOpen } from '@/bootstrap/left-open';
import { ChallengeDone } from '@/challenges/components/challenge-done';
import { useLibrary } from '@/challenges/library-live';
import type { Library } from '@/challenges/library-view';
import { useSessionStart } from '@/challenges/session-start';
import { SessionGate, SessionScreen } from '@/workout/components/session-screen';

// The camera session for one of your runs: /workout/<run id>, or /workout/squat for one go (a free log).
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const library = useLibrary();
  // Opened by a link at launch: startup's prompt already offers back the workout it found open.
  const handled = useLeftOpen();
  const left = library.workouts.find(({ id, status }) => status === 'open' && id !== handled.id);
  return (
    <SessionGate openWorkout={left ?? null} waiting={handled.deciding}>
      {/* A new id is a new session. */}
      {(workoutId) => <Session key={id} id={id} library={library} workoutId={workoutId} />}
    </SessionGate>
  );
}

function Session({ id, library, workoutId }: { id: string; library: Library; workoutId: string }) {
  const router = useRouter();
  const { start, challenge, target, run } = useSessionStart(library, id, workoutId);
  return (
    <SessionScreen
      workoutId={workoutId}
      challenge={challenge}
      target={target}
      start={start}
      done={(page) => <ChallengeDone {...page} run={run} />}
      onLeave={() => router.back()}
    />
  );
}
