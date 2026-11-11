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
  const router = useRouter();
  const library = useLibrary();
  const launchLeft = useLeftOpen();
  const left = library.workouts.find(({ status }) => status === 'open') ?? null;
  // Opened by a link at launch: startup's prompt offers this one back; wait for its Save or Discard.
  const waiting = left !== null && left.id === launchLeft;
  return (
    <SessionGate key={id} openWorkout={left} waiting={waiting} onLeave={() => router.back()}>
      {(workoutId) => <Session id={id} library={library} workoutId={workoutId} />}
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
