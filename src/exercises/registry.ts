import type { Exercise } from './exercise';
import { gluteBridge, type GluteBridgeSample, type GluteBridgeState } from './glute-bridge';
import { jumpingJack, type JumpingJackSample, type JumpingJackState } from './jumping-jack';
import { lunge, type LungeSample, type LungeState } from './lunge';
import type { HoldState } from './hold';
import { plank, type PlankSample } from './plank';
import { pushup, type PushupSample, type PushupState } from './pushup';
import { situp, type SitupSample, type SitupState } from './situp';
import { squat, type SquatSample, type SquatState } from './squat';

// The exercise input: one frame's joints. Other folders import these from here, not from geometry.
export type { BodyPart, Pose } from './geometry';
export type { Kind, Phase, Progress } from './progress';
export type { Placement } from './exercise';
export { outOfFrame } from './geometry';
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
};
export type Samples = {
  squat: SquatSample;
  pushup: PushupSample;
  plank: PlankSample;
  situp: SitupSample;
  'glute-bridge': GluteBridgeSample;
  'jumping-jack': JumpingJackSample;
  lunge: LungeSample;
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
};
