// The plank position: forearm or high, judged side-on from the better-seen side.
import { SIDE } from 'superhabit-pose/joints';

import {
  add,
  angle,
  bestSide,
  dot,
  gravity,
  length,
  reject,
  rise,
  scale,
  sub,
  type Joints,
  type Pose,
  type Side,
} from '@/exercises/body/geometry';
import type { Position } from './position';

/**
 * By the phone's gravity, in forearm lengths: hip and knee height above the wrists, which rest on the
 * floor in either plank; how far the hip sits below the shoulder–ankle line (a sag; negative: a pike);
 * and how far that line rises from level, in degrees.
 */
export type Floor = { hip: number; knee: number; drop: number; rise: number };

/** Shape on the better-seen side, for forearm and high planks. */
export type PlankSample = {
  reach: number;
  knees: number;
  /** Knee clearance above the ankle–wrist support line, in hip heights. */
  clearance: number;
  /** Hip clearance above the ankle–wrist support line, in shoulder heights. */
  hips: number;
  body: number;
  /** Shoulder–elbow–wrist: straight on the hands, bent on the forearms. */
  elbow: number;
  /** Knee height above the wrist along the forearm, in forearm lengths; meaningful on the hands only. */
  lift: number;
  /** What is off the floor, by the phone's gravity; null when it gave none (older clips). */
  floor: Floor | null;
  joints: Joints;
  /** The side measured, so a movement can be read on the same side. */
  side: Side;
};

// S5 local traces: occluded knees/wrists need visibility 0.1 and forearm reach extends to 155°.
// With ankles required, the high-plank clip needs BODY_MIN 137° (was 142°); its world body line
// reads 135–149°. Hip clearance still rejects a 40° sag. Together these gates pass 7/9 clips.
const MIN_VISIBILITY = 0.1;
const REACH_MIN = 40;
const REACH_MAX = 155;
const BODY_MIN = 137;
const HIPS_MIN = 0.2;
const KNEES_MIN = 150;
// A straight forearm plank can have nearly straight knees even with its shins resting on the floor.
const CLEARANCE_MIN = 0.1;
// Without gravity: on the hands the forearm stands upright, so knee height along it is "up from the
// floor" however the phone lies. Device push-up tops read the knee angle 130–149° and clearance near 0
// with the knees up; this reads ~0.5–0.8 on the toes and ~0–0.2 on the knees. A deep sag also lowers
// the knees, so knees down means low and bent: sagging with straight legs is form, not kneeling.
const HANDS_ELBOW = 140;
const LIFT_MIN = 0.35;

// With gravity, what touches the floor decides, for either plank. Device clips checked against video,
// in forearm lengths: hips 1.03+ above the wrists in a plank or kneeling, under 0.72 in a sag, on a
// side or lying; hip drop below the body line −0.41–0.14 in a plank or a push-up (its bottom too),
// 0.79+ in a sag, 0.17–0.32 lying or on a side; knees 0.45+ above the wrists on the toes, under 0.15
// on the knees. A plank's shoulder–ankle line rises 3–26°, standing 47–81°. Hip height is judged at
// rest only: a push-up's bottom brings the hips to 0.2.
const RISE_MAX = 45;
const HIP_MIN = 0.85;
const KNEE_MIN = 0.3;
const DROP_MAX = 0.4;
// shortcut: these shape gates also credit other movements (6/10 push-up, 0/10 squat clips ≥10s);
// revisit movement rejection after reviewing device traces, before relying on this for accuracy.

export function measurePlank(pose: Pose): PlankSample | null {
  const side = bestSide(pose, (j) => Object.values(j), MIN_VISIBILITY);
  if (!side) return null;
  const { shoulder: s, elbow: e, wrist: w, hip: h, knee: k, ankle: a } = SIDE[side];
  const world = pose.worldLandmarks;
  const support = sub(world[w], world[a]);
  const shoulder = sub(world[s], world[a]);
  // Remove the support-line component: this stays valid when the camera rotates, for either plank.
  const up = reject(shoulder, support);
  const hipHeight = dot(sub(world[h], world[a]), up);
  const forearm = sub(world[e], world[w]);
  const shape = {
    reach: angle(world[h], world[s], world[w]),
    knees: angle(world[h], world[k], world[a]),
    body: angle(world[s], world[h], world[a]),
    elbow: angle(world[s], world[e], world[w]),
    lift: dot(sub(world[k], world[w]), forearm) / length(forearm) ** 2,
    clearance: dot(sub(world[k], world[a]), up) / hipHeight,
    hips: hipHeight / length(up) ** 2,
  };
  const joints: Joints = [s, h, a];
  if (!Object.values(shape).every(Number.isFinite)) return null;
  const down = gravity(pose);
  const height = (i: number) => (down ? -dot(sub(world[i], world[w]), down) / length(forearm) : 0);
  // The point on the shoulder–ankle line level with the hip along it.
  const line = add(
    world[a],
    scale(shoulder, dot(sub(world[h], world[a]), shoulder) / dot(shoulder, shoulder)),
  );
  const floor = down && {
    hip: height(h),
    knee: height(k),
    drop: dot(sub(world[h], line), down) / length(forearm),
    rise: rise(pose, world[a], world[s]) ?? 0,
  };
  return { ...shape, floor, joints, side };
}

export const plankPosition: Position<PlankSample> = {
  ready: 'Get into a plank',
  lost: 'Back into your plank',
  parts: ['head', 'hands', 'hips', 'feet'],
  read: measurePlank,
  setup: ({ floor, ...m }) => {
    if (m.reach < REACH_MIN || m.reach > REACH_MAX) return 'Get into a plank';
    if (floor) {
      if (floor.rise > RISE_MAX) return 'Get down into a plank';
      // Hips down with the body straight is lying (flat, on the forearms or a side); bent at the hips
      // it is a sag, which form judges.
      if (floor.hip < HIP_MIN) return floor.drop < DROP_MAX ? 'Get into a plank' : null;
      return floor.knee < KNEE_MIN ? 'Knees off the floor' : null;
    }
    // Knees down is a kneeling plank: another position, not a plank with poor form.
    const knees =
      m.elbow >= HANDS_ELBOW
        ? m.lift < LIFT_MIN && m.knees < KNEES_MIN
        : m.knees < KNEES_MIN || m.clearance < CLEARANCE_MIN;
    return knees ? 'Knees off the floor' : null;
  },
  form: ({ floor, ...m }) =>
    m.body < BODY_MIN || (floor ? floor.drop > DROP_MAX : m.hips < HIPS_MIN)
      ? 'Keep your body straight'
      : null,
};
