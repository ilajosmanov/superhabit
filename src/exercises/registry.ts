import { burpee } from './burpee';
import type { Exercise } from './exercise';
import { gluteBridge } from './glute-bridge';
import { jumpingJack } from './jumping-jack';
import { legRaise } from './leg-raise';
import { lunge } from './lunge';
import { plank } from './plank';
import { pushup } from './pushup';
import { sidePlank } from './side-plank';
import { situp } from './situp';
import { sideSquat, squat } from './squat';
import { wallSit } from './wall-sit';

// Shared exercise contracts for consumers of the registry.
export type { BodyPart, Pose } from '@/exercises/body/geometry';
export type { Kind, Phase, Progress } from '@/exercises/kinds/progress';
export type { Placement } from './exercise';
export { outOfFrame } from '@/exercises/body/geometry';
export { orientation } from './exercise';

/** The single list of exercises. Add an entry here, and to `initialCounters`, to add an exercise. */
const LIST = {
  squat,
  pushup,
  plank,
  situp,
  'glute-bridge': gluteBridge,
  'jumping-jack': jumpingJack,
  lunge,
  'side-squat': sideSquat,
  'wall-sit': wallSit,
  'side-plank': sidePlank,
  'leg-raise': legRaise,
  burpee,
};
type List = typeof LIST;
export type ExerciseId = keyof List;
/** Hand-bump when an exercise's counting rules change. */
export const COUNTER_VERSIONS = {
  squat: '1.1.0',
  pushup: '1.0.0',
  plank: '1.0.0',
  situp: '1.0.0',
  'glute-bridge': '1.0.0',
  'jumping-jack': '1.1.0',
  lunge: '1.0.0',
  'side-squat': '1.1.0',
  'wall-sit': '1.0.0',
  'side-plank': '1.0.0',
  'leg-raise': '1.0.0',
  burpee: '1.0.0',
} satisfies Record<ExerciseId, `${number}.${number}.${number}`>;

/** Each exercise's counter state and sample, by id. */
export type Counters = { [K in ExerciseId]: List[K]['initial'] };
export type Samples = { [K in ExerciseId]: NonNullable<ReturnType<List[K]['measure']>> };

// Mapped type so `EXERCISES[id].step(counters[id], …)` type-checks for a generic id.
export const EXERCISES: { [K in ExerciseId]: Exercise<Counters[K], Samples[K]> } = LIST;

/** Fresh counters for every exercise; typed against Counters so a new key cannot be forgotten. */
export const initialCounters: Counters = {
  squat: squat.initial,
  pushup: pushup.initial,
  plank: plank.initial,
  situp: situp.initial,
  'glute-bridge': gluteBridge.initial,
  'jumping-jack': jumpingJack.initial,
  lunge: lunge.initial,
  'side-squat': sideSquat.initial,
  'wall-sit': wallSit.initial,
  'side-plank': sidePlank.initial,
  'leg-raise': legRaise.initial,
  burpee: burpee.initial,
};
