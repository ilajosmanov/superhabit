import { expect, test } from 'vite-plus/test';

import { Joint } from 'reprepgo-pose/joints';

import { JOINTS, skeleton } from './skeleton';

const at = (entries: Record<number, [number, number]>) =>
  Array.from({ length: JOINTS }, (_, i) => {
    const point = entries[i];
    return point ? { x: point[0], y: point[1] } : null;
  });

test('no joints draws nothing', () => {
  expect(skeleton(at({}), null)).toEqual({
    near: [],
    far: [],
    limb: [],
    dots: [],
    limbDots: [],
    arc: null,
  });
});

test('bones need both ends; the neck runs from mid-shoulder to the nose', () => {
  const s = skeleton(
    at({
      [Joint.NOSE]: [5, 0],
      [Joint.LEFT_SHOULDER]: [0, 10],
      [Joint.RIGHT_SHOULDER]: [10, 10],
      [Joint.LEFT_ELBOW]: [0, 20],
    }),
    null,
  );
  expect(s.near).toEqual([
    [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ],
    [
      { x: 0, y: 10 },
      { x: 0, y: 20 },
    ],
    [
      { x: 5, y: 10 },
      { x: 5, y: 0 },
    ],
  ]);
  expect(s.far).toEqual([]);
  expect(s.dots).toHaveLength(4); // nose and three joints
});

test('the measured limb is pulled out, the other side dimmed, the arc spans the inside angle', () => {
  // Left arm measured, bent 90° at the elbow; right arm on the far side.
  const s = skeleton(
    at({
      [Joint.LEFT_SHOULDER]: [0, 0],
      [Joint.LEFT_ELBOW]: [0, 10],
      [Joint.LEFT_WRIST]: [10, 10],
      [Joint.RIGHT_SHOULDER]: [20, 0],
      [Joint.RIGHT_ELBOW]: [20, 10],
      [Joint.RIGHT_WRIST]: [20, 20],
    }),
    [Joint.LEFT_SHOULDER, Joint.LEFT_ELBOW, Joint.LEFT_WRIST],
  );
  expect(s.limb).toEqual([
    [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ],
    [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ],
  ]);
  expect(s.far).toHaveLength(2); // right shoulder-elbow, elbow-wrist
  expect(s.near).toHaveLength(1); // shoulder line crosses the body
  expect(s.dots).toHaveLength(3); // right shoulder, elbow, wrist
  const [a, vertex, c] = s.limbDots.map((d) => d.r);
  expect(vertex).toBeGreaterThan(Math.max(a, c)); // the measured joint stands out
  expect(s.arc).toMatchObject({ x: 0, y: 10, start: -90, sweep: 90 });
});

test('the arc sweeps the short way across ±180°', () => {
  // Rays at 170° and -170°: the inside is 20° through 180°, not 340°.
  const v: [number, number] = [0, 0];
  const deg = (d: number): [number, number] => [
    Math.cos((d * Math.PI) / 180) * 10,
    Math.sin((d * Math.PI) / 180) * 10,
  ];
  const s = skeleton(
    at({ [Joint.LEFT_HIP]: deg(170), [Joint.LEFT_KNEE]: v, [Joint.LEFT_ANKLE]: deg(-170) }),
    [Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
  );
  expect(s.arc?.sweep).toBeCloseTo(20);
});
