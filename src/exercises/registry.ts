import type { Exercise } from './exercise';
import { gluteBridge, type GluteBridgeSample, type GluteBridgeState } from './glute-bridge';
import { legRaise, type LegRaiseSample, type LegRaiseState } from './leg-raise';
import { jumpingJack, type JumpingJackSample, type JumpingJackState } from './jumping-jack';
import { lunge, type LungeSample, type LungeState } from './lunge';
import type { HoldState } from '@/exercises/kinds/hold';
import { plank, type PlankSample } from './plank';
import { pushup, type PushupSample, type PushupState } from './pushup';
import { sidePlank, type SidePlankSample } from './side-plank';
import { situp, type SitupSample, type SitupState } from './situp';
import { sideSquat, squat, type SquatSample, type SquatState } from './squat';
import { wallSit, type WallSitSample } from './wall-sit';

// The exercise input: one frame's joints. Other folders import these from here, not from geometry.
export type { BodyPart, Pose } from '@/exercises/body/geometry';
export type { Kind, Phase, Progress } from '@/exercises/kinds/progress';
export type { Placement } from './exercise';
export { outOfFrame } from '@/exercises/body/geometry';
export { orientation } from './exercise';

/** The single list of exercises: one counter state and sample type per id. Add a key to both to add an exercise. */
export type Counters = {
  squat: SquatState;
  pushup: PushupState;
  plank: HoldState;
  situp: SitupState;
  'glute-bridge': GluteBridgeState;
  'jumping-jack': JumpingJackState;
  lunge: LungeState;
  'side-squat': SquatState;
  'wall-sit': HoldState;
  'side-plank': HoldState;
  'leg-raise': LegRaiseState;
};
export type Samples = {
  squat: SquatSample;
  pushup: PushupSample;
  plank: PlankSample;
  situp: SitupSample;
  'glute-bridge': GluteBridgeSample;
  'jumping-jack': JumpingJackSample;
  lunge: LungeSample;
  'side-squat': SquatSample;
  'wall-sit': WallSitSample;
  'side-plank': SidePlankSample;
  'leg-raise': LegRaiseSample;
};
export type ExerciseId = keyof Counters & keyof Samples;

// Mapped type so `EXERCISES[id].step(counters[id], …)` type-checks for a generic id.
// A missing entry for a Counters key is a compile error.
export const EXERCISES: { [K in ExerciseId]: Exercise<Counters[K], Samples[K]> } = {
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
};

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
};
