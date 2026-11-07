import { ExercisePicker } from '@/challenges/components/exercise-picker';
import { Screen } from '@/components/screen';

/** A new challenge, step one: the exercise. */
export default function CreateScreen() {
  return (
    <Screen title="New challenge">
      <ExercisePicker />
    </Screen>
  );
}
