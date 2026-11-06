import type { SkPoint } from '@shopify/react-native-skia';

import { Joint } from 'superhabit-pose/joints';

/** Landmarks per detection, in MediaPipe order. */
export const JOINTS = Object.keys(Joint).length;

/** Shoulders, arms, torso, hips and legs; face, hands and feet are left out. */
const BONES: readonly (readonly [number, number])[] = [
  [Joint.LEFT_SHOULDER, Joint.RIGHT_SHOULDER],
  [Joint.LEFT_HIP, Joint.RIGHT_HIP],
  [Joint.LEFT_SHOULDER, Joint.LEFT_ELBOW],
  [Joint.LEFT_ELBOW, Joint.LEFT_WRIST],
  [Joint.RIGHT_SHOULDER, Joint.RIGHT_ELBOW],
  [Joint.RIGHT_ELBOW, Joint.RIGHT_WRIST],
  [Joint.LEFT_SHOULDER, Joint.LEFT_HIP],
  [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP],
  [Joint.LEFT_HIP, Joint.LEFT_KNEE],
  [Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
  [Joint.RIGHT_HIP, Joint.RIGHT_KNEE],
  [Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE],
];
const BODY_JOINTS = [...new Set(BONES.flat())];
const LEFT: readonly number[] = Object.entries(Joint)
  .filter(([name]) => name.startsWith('LEFT_'))
  .map(([, index]) => index);
const RIGHT: readonly number[] = Object.entries(Joint)
  .filter(([name]) => name.startsWith('RIGHT_'))
  .map(([, index]) => index);

export type Segment = readonly [SkPoint, SkPoint];
export type Dot = { x: number; y: number; r: number };
type Arc = { x: number; y: number; r: number; start: number; sweep: number };

type Skeleton = {
  /** Bones on the measured side, the centre lines and the neck. */
  near: Segment[];
  /** Bones entirely on the side away from the measured limb, drawn dimmer. */
  far: Segment[];
  /** The measured limb: a→vertex and vertex→c. */
  limb: Segment[];
  dots: Dot[];
  limbDots: Dot[];
  /** Angle arc at the vertex, in Skia degrees (clockwise from +x, y down). */
  arc: Arc | null;
};

const DOT = 6;
const BIG_DOT = 7;
const ARC_RADIUS = 22;

/** Which segments, dots and arc to draw for the joints, given the measured angle's [a, vertex, c]. */
export function skeleton(
  joints: readonly (SkPoint | null)[],
  highlight: readonly [number, number, number] | null,
): Skeleton {
  'worklet';
  const near: Segment[] = [];
  const far: Segment[] = [];
  const limb: Segment[] = [];
  const dots: Dot[] = [];
  const limbDots: Dot[] = [];
  const side = (i: number) => (LEFT.includes(i) ? 'left' : RIGHT.includes(i) ? 'right' : null);
  const nearSide = highlight ? side(highlight[1]) : null;
  const inLimb = (a: number, b: number) =>
    highlight !== null &&
    ((a === highlight[0] && b === highlight[1]) ||
      (a === highlight[1] && b === highlight[0]) ||
      (a === highlight[1] && b === highlight[2]) ||
      (a === highlight[2] && b === highlight[1]));

  for (const [a, b] of BONES) {
    const p = joints[a];
    const q = joints[b];
    if (!p || !q || inLimb(a, b)) continue;
    const isFar = nearSide !== null && side(a) === side(b) && side(a) !== nearSide;
    (isFar ? far : near).push([p, q]);
  }

  const nose = joints[Joint.NOSE];
  const left = joints[Joint.LEFT_SHOULDER];
  const right = joints[Joint.RIGHT_SHOULDER];
  const neck =
    left && right ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 } : (left ?? right);
  if (nose && neck) near.push([neck, nose]);
  if (nose) dots.push({ x: nose.x, y: nose.y, r: BIG_DOT });

  for (const i of BODY_JOINTS) {
    const p = joints[i];
    if (p && !highlight?.includes(i)) dots.push({ x: p.x, y: p.y, r: DOT });
  }

  let arc: Arc | null = null;
  if (highlight) {
    const [a, v, c] = highlight.map((i) => joints[i] ?? null);
    if (a && v) limb.push([a, v]);
    if (v && c) limb.push([v, c]);
    if (a) limbDots.push({ x: a.x, y: a.y, r: DOT });
    if (v) limbDots.push({ x: v.x, y: v.y, r: BIG_DOT });
    if (c) limbDots.push({ x: c.x, y: c.y, r: DOT });
    if (a && v && c) {
      const start = (Math.atan2(a.y - v.y, a.x - v.x) * 180) / Math.PI;
      const end = (Math.atan2(c.y - v.y, c.x - v.x) * 180) / Math.PI;
      // The inside of the angle: the shorter way round, either direction.
      const sweep = ((((end - start) % 360) + 540) % 360) - 180;
      arc = { x: v.x, y: v.y, r: ARC_RADIUS, start, sweep };
    }
  }

  return { near, far, limb, dots, limbDots, arc };
}
