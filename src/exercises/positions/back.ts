// On your back, judged side-on from the better-seen side by the phone's gravity: knees bent (sit-up,
// glute bridge) or legs straight (leg raise).
import { SIDE } from 'superhabit-pose/joints';

import {
  angle,
  bestSide,
  degrees,
  dot,
  gravity,
  length,
  seen,
  sub,
  type Joints,
  type Pose,
  type Side,
} from '@/exercises/body/geometry';
import type { Position } from './position';

/** One frame on the better-seen side. */
export type BackSample = {
  /** How far the shoulder rises over the hip, in degrees: 0 lying, 90 sitting up, below 0 hips up. */
  torso: number;
  knee: number;
  /** The hip over the ankle, in torso lengths: about 0 lying, both on the floor. */
  hipOverAnkle: number;
  /** The ankle over the shoulder, in torso lengths: about 0 with both on the floor. */
  feet: number;
  /** The lower seen wrist over the hip, in torso lengths; null with neither wrist seen. */
  hands: number | null;
  joints: Joints;
  side: Side;
};

// Device clips with gravity, checked against their video (front camera, phone on the floor side-on):
// lying reads the torso at −4–13°, sitting 55° and up, a bridge's top −16 to −27°, a V-up 20–29°;
// the hip −0.15–0.28 torso lengths over the ankle, bending over or crouching to the phone 0.32 and up.
const LYING_MAX = 20;
const HIPS_MAX = 0.3;
// Sitting up with hands behind the head puts the near wrist 0.77–1.4 torso lengths over the hip at the
// top; pulling on the shins or pushing off the floor, 0.14–0.75 for most of the top.
const UP = 45;
const HANDS_MIN = 0.5;
// The near knee: bent 40–113° through sit-ups and bridges; straight 138–179° through leg raises, dipping
// to 126° for a frame as the legs leave the floor; a tuck 85–93°.
const BENT_MAX = 140;
const STRAIGHT_MIN = 115;
// The ankle sits 0.01–0.31 torso lengths over the shoulder with the hips up, both on the floor.
const FEET_MAX = 0.5;

/** Null without the phone's gravity: shape alone can't tell lying from sitting or standing. */
function measureBack(pose: Pose): BackSample | null {
  const down = gravity(pose);
  if (!down) return null;
  const side = bestSide(pose, (j) => [j.shoulder, j.hip, j.knee, j.ankle]);
  if (!side) return null;
  const { shoulder: s, hip: h, knee: k, ankle: a } = SIDE[side];
  const world = pose.worldLandmarks;
  const trunk = length(sub(world[s], world[h]));
  const up = (i: number) => -dot(sub(world[i], world[h]), down) / trunk;
  const wrists = [SIDE.left.wrist, SIDE.right.wrist].filter((i) => seen(pose, i));
  const sample = {
    torso: degrees(Math.asin(Math.min(1, Math.max(-1, up(s))))),
    knee: angle(world[h], world[k], world[a]),
    hipOverAnkle: -up(a),
    feet: up(a) - up(s),
  };
  if (!Object.values(sample).every(Number.isFinite)) return null;
  const hands = wrists.length ? Math.min(...wrists.map(up)) : null;
  return { ...sample, hands, joints: [s, h, k], side };
}

const lying = (cue: string) => (m: BackSample) =>
  Math.abs(m.torso) > LYING_MAX || m.hipOverAnkle > HIPS_MAX ? cue : null;

/** Knees bent, feet on the floor. The torso may rise, but not on the hands. */
export const kneesBentPosition: Position<BackSample> = {
  ready: 'Lie back, knees bent',
  lost: 'Lie back down',
  parts: ['head', 'hips', 'feet'],
  read: measureBack,
  setup: lying('Lie back, knees bent'),
  form: (m) => {
    if (m.knee > BENT_MAX) return 'Keep your knees bent';
    if (m.feet > FEET_MAX) return 'Keep your feet down';
    // shortcut: hands never seen pass; refuse instead if cheats turn up that hide both wrists.
    return m.torso > UP && m.hands !== null && m.hands < HANDS_MIN
      ? 'Hands behind your head'
      : null;
  },
};

/** Legs straight, the back flat on the floor throughout. */
export const legsStraightPosition: Position<BackSample> = {
  ready: 'Lie flat, legs straight',
  lost: 'Lie back down',
  parts: ['head', 'hips', 'feet'],
  read: measureBack,
  setup: lying('Lie flat, legs straight'),
  form: (m) =>
    m.knee < STRAIGHT_MIN
      ? 'Keep your legs straight'
      : Math.abs(m.torso) > LYING_MAX
        ? 'Keep your back on the floor'
        : null,
};
