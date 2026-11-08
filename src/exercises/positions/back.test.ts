import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body, onBack } from '@/exercises/__fixtures__/body';
import type { Pose } from '@/exercises/body/geometry';
import { kneesBentPosition, legsStraightPosition } from './back';

const read = kneesBentPosition.read;
const at = (pose: Pose) => {
  const m = read(pose);
  assert(m);
  return m;
};
const hooked = onBack({ thigh: 45, shin: 45 });

describe('on your back: the reading', () => {
  it('reads the torso, the knee, the hip over the ankle and the hands, by gravity', () => {
    const m = read(onBack({ thigh: 45, shin: 45, lean: 70 }));
    assert(m);
    expect(m.torso).toBeCloseTo(68, 0);
    expect(m.knee).toBeCloseTo(90);
    expect(m.hipOverAnkle).toBeCloseTo(0);
    expect(m.hands).toBeGreaterThan(1);
    expect(m.joints).toEqual([Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE]);
    expect(read(onBack({ thigh: 45, shin: 45, lean: 70 }, 'floor'))?.hands).toBeCloseTo(0);
  });

  it('reads nothing without gravity', () => {
    expect(read({ ...hooked, down: undefined })).toBeNull();
  });
});

describe('on your back: setup', () => {
  it.each([
    ['lying with knees bent', hooked, null],
    ['sitting up', onBack({ thigh: 45, shin: 45, lean: 70 }), 'Lie back, knees bent'],
    // Torso level, but the hips a leg's length over the ankles.
    ['bending over to the phone', { ...body({ lean: 90 }) }, 'Lie back, knees bent'],
  ])('%s', (_, pose, cue) => {
    const m = read(pose);
    assert(m);
    expect(kneesBentPosition.setup(m)).toBe(cue);
  });
});

describe('on your back: form', () => {
  const bent = (pose = hooked) => kneesBentPosition.form(at(pose));
  const straight = (pose = onBack({})) => legsStraightPosition.form(at(pose));

  it('knees bent: the knees stay bent, and sitting up is not done on the hands', () => {
    expect(bent()).toBeNull();
    expect(bent(onBack({}))).toBe('Keep your knees bent');
    expect(bent(onBack({ thigh: 45, shin: 45, lean: 70 }))).toBeNull();
    expect(bent(onBack({ thigh: 45, shin: 45, lean: 70 }, 'floor'))).toBe('Hands behind your head');
    expect(bent(onBack({ thigh: 45, shin: 45, lean: -25 }))).toBeNull();
    // The hips up with the feet off the floor, knees over the hips and shins level: not a bridge.
    expect(bent(onBack({ thigh: 90, lean: -25 }))).toBe('Keep your feet down');
    // Hands on the floor while still lying back are only resting.
    expect(bent(onBack({ thigh: 45, shin: 45, lean: 30 }, 'floor'))).toBeNull();
  });

  it('knees bent: hands out of sight pass', () => {
    const pose = onBack({ thigh: 45, shin: 45, lean: 70 }, 'floor');
    for (const w of [Joint.LEFT_WRIST, Joint.RIGHT_WRIST]) pose.landmarks[w].visibility = 0.1;
    expect(bent(pose)).toBeNull();
  });

  it('legs straight: the knees stay straight and the back stays down', () => {
    expect(straight()).toBeNull();
    expect(straight(onBack({ thigh: 85, shin: -85 }))).toBeNull();
    expect(straight(onBack({ thigh: 85 }))).toBe('Keep your legs straight');
    expect(straight(onBack({ thigh: 85, shin: -85, lean: 30 }))).toBe(
      'Keep your back on the floor',
    );
    // The hips rolled up off the floor instead.
    expect(straight(onBack({ thigh: 85, shin: -85, lean: -30 }))).toBe(
      'Keep your back on the floor',
    );
  });
});
