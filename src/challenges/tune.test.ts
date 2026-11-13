import { describe, expect, it } from 'vite-plus/test';

import { SUGGESTED_CHALLENGES } from './suggested';
import { dayChoices, flipDay, knobsOf, rangeOf, tuned, valueOf, limitOf, withValue } from './tune';
import { defineChallenge, MAX, reps, seconds, setsIn, type Session } from '@/workout/plan/plan';
import { weeklySchedule } from '@/workout/plan/schedule';

it('changes workload and duration while preserving recovery positions', () => {
  const plan = defineChallenge({
    name: 'Weekly',
    days: 7,
    restartOnMiss: false,
    dailyTotal: false,
    schedule: weeklySchedule(7, [1, 4]),
    session: [{ rounds: 1, steps: [{ exercise: 'squat', goal: reps(20) }] }],
  });
  const changed = tuned(plan, { [knobsOf(plan)[0].key]: 5, days: 9 });
  expect(changed.schedule).toEqual([
    'training',
    'rest',
    'rest',
    'training',
    'rest',
    'rest',
    'rest',
    'training',
    'rest',
  ]);
  expect(changed.session[0].steps[0].goal).toEqual(reps(5));
  expect(tuned(plan, { days: 2 }).schedule).toEqual(['training', 'rest']);
});

it('flips days between workout and rest, keeps one workout, and repeats your pattern when extended', () => {
  const plan = defineChallenge({
    name: 'Weekly',
    days: 3,
    restartOnMiss: false,
    dailyTotal: false,
    schedule: ['training', 'rest', 'rest'],
    session: [{ rounds: 1, steps: [{ exercise: 'squat', goal: reps(20) }] }],
  });
  const yours = flipDay(plan, ['training', 'rest', 'rest'], 1);
  expect(yours).toEqual(['training', 'training', 'rest']);
  expect(tuned(plan, { days: 5 }, yours).schedule).toEqual([
    'training',
    'training',
    'rest',
    'training',
    'training',
  ]);
  // The only workout stays one; flipping back to ours forgets your pattern.
  expect(flipDay(plan, ['training', 'rest', 'rest'], 0)).toEqual(['training', 'rest', 'rest']);
  expect(flipDay(plan, ['training', 'training', 'rest'], 1)).toBeNull();
});

const challenge = (session: Session) =>
  defineChallenge({ name: 'Morning', days: 14, restartOnMiss: true, dailyTotal: false, session });
const rest = { exercise: 'rest', goal: seconds(30) } as const;
const circuit = challenge([
  {
    steps: [
      { exercise: 'pushup', goal: reps(10) },
      { exercise: 'situp', goal: reps(15) },
      { exercise: 'glute-bridge', goal: reps(15) },
      { exercise: 'plank', goal: seconds(30) },
      rest,
    ],
    rounds: 3,
  },
]);
const twoBlocks = challenge([
  { steps: [{ exercise: 'pushup', goal: reps(10) }, rest], rounds: 5 },
  { steps: [{ exercise: 'squat', goal: reps(15) }, rest], rounds: 5 },
]);

describe('tuning a plan', () => {
  it('lets recovery change independently of the exercise targets and rounds', () => {
    const recovery = knobsOf(circuit).find(({ kind }) => kind === 'rest');
    expect(recovery).toBeDefined();
    if (!recovery) throw new Error('Recovery control missing');
    const changed = tuned(circuit, { [recovery.key]: 90 });
    expect(changed.session[0].steps).toEqual([
      ...circuit.session[0].steps.slice(0, -1),
      { exercise: 'rest', goal: seconds(90) },
    ]);
    expect(changed.session[0].rounds).toBe(3);
    expect(circuit.session[0].steps.at(-1)).toEqual(rest);
    expect(() => tuned(circuit, { [recovery.key]: 'max' })).toThrow();
  });

  it('offers circuit exercise numbers and rounds once, including recovery, then days', () => {
    expect(knobsOf(circuit)).toMatchObject([
      { kind: 'reps', exercise: 'pushup', block: 0, ours: 10 },
      { kind: 'reps', exercise: 'situp', block: 0, ours: 15 },
      { kind: 'reps', exercise: 'glute-bridge', block: 0, ours: 15 },
      { kind: 'seconds', exercise: 'plank', block: 0, ours: 30 },
      { kind: 'rest', block: 0, ours: 30 },
      { kind: 'rounds', block: 0, ours: 3 },
      { key: 'days', kind: 'days', ours: 14 },
    ]);
  });

  it('offers each block in session order with distinct keys', () => {
    const knobs = knobsOf(twoBlocks);
    expect(knobs).toMatchObject([
      { kind: 'reps', exercise: 'pushup', block: 0, ours: 10 },
      { kind: 'rest', block: 0, ours: 30 },
      { kind: 'rounds', block: 0, ours: 5 },
      { kind: 'reps', exercise: 'squat', block: 1, ours: 15 },
      { kind: 'rest', block: 1, ours: 30 },
      { kind: 'rounds', block: 1, ours: 5 },
      { kind: 'days', ours: 14 },
    ]);
    expect(new Set(knobs.map(({ key }) => key)).size).toBe(7);
  });

  it('swaps numbers independently, keeping omitted values, rests, MAX and metadata', () => {
    const original = challenge([
      {
        steps: [
          { exercise: 'pushup', goal: reps(3) },
          rest,
          { exercise: 'plank', goal: seconds(10) },
        ],
        rounds: 2,
      },
      {
        steps: [
          { exercise: 'pushup', goal: reps(1) },
          { exercise: 'situp', goal: MAX },
        ],
        rounds: 1,
      },
    ]);
    const before = structuredClone(original);
    const knobs = knobsOf(original);
    expect(knobs).toHaveLength(8);
    const values = {
      [knobs[0].key]: 7,
      '0:step:2': 25,
      '0:rounds': 4,
      '1:rounds': 2,
      days: 21,
    };
    const result = tuned(original, values);
    expect(result).toEqual({
      name: 'Morning',
      days: 21,
      restartOnMiss: true,
      dailyTotal: false,
      session: [
        {
          steps: [
            { exercise: 'pushup', goal: reps(7) },
            rest,
            { exercise: 'plank', goal: seconds(25) },
          ],
          rounds: 4,
        },
        {
          steps: [
            { exercise: 'pushup', goal: reps(1) },
            { exercise: 'situp', goal: MAX },
          ],
          rounds: 2,
        },
      ],
    });
    expect(knobs.map((knob) => valueOf(knob, values))).toEqual([7, 30, 25, 4, 1, 'max', 2, 21]);
    expect(knobsOf(result).map(({ key }) => key)).toEqual(knobs.map(({ key }) => key));
    expect(original).toEqual(before);
    expect(() => tuned(original, { [knobs[0].key]: 0 })).toThrow('reps must be an integer >= 1');
  });

  it.each([
    ['pushup', 'reps', 7, reps(7), { min: 5, max: 150, step: 5 }],
    ['plank', 'seconds', 45, seconds(45), { min: 10, max: 300, step: 10 }],
  ] as const)('tunes a MAX %s to a typed number and back', (exercise, kind, n, goal, range) => {
    const original = challenge([{ steps: [{ exercise, goal: MAX }], rounds: 1 }]);
    const [knob] = knobsOf(original);
    expect(knob).toMatchObject({ exercise, kind, ours: 'max' });
    expect(rangeOf(knob)).toEqual(range);
    const numbered = tuned(original, { [knob.key]: n });
    expect(numbered.session[0].steps[0].goal).toEqual(goal);
    expect(tuned(numbered, { [knob.key]: 'max' })).toEqual(original);
  });

  it('offers a daily total no rounds, since it is one set', () => {
    const daily = defineChallenge({
      ...challenge([{ steps: [{ exercise: 'pushup', goal: reps(100) }], rounds: 1 }]),
      dailyTotal: true,
    });
    const knobs = knobsOf(daily);
    expect(knobs.map(({ kind }) => kind)).toEqual(['reps', 'days']);
    expect(() => tuned(daily, { [knobs[0].key]: 'max' })).toThrow(
      'daily total cannot have a MAX goal',
    );
    expect(tuned(daily, { [knobs[0].key]: 120 })).toMatchObject({
      dailyTotal: true,
      session: [{ steps: [{ goal: reps(120) }], rounds: 1 }],
    });
  });

  it('drops the closing rest when the last block is cut to one round', () => {
    const rounds = knobsOf(circuit).find(({ kind }) => kind === 'rounds');
    if (!rounds) throw new Error('Rounds control missing');
    expect(tuned(circuit, { [rounds.key]: 1 }).session).toEqual([
      { steps: circuit.session[0].steps.slice(0, -1), rounds: 1 },
    ]);
  });
});

describe('slider stops', () => {
  it.each(SUGGESTED_CHALLENGES.map(({ challenge: c }) => [c.name, c] as const))(
    '%s starts exactly on its stops',
    (_, c) => {
      for (const knob of knobsOf(c)) {
        const { min, max, step } = rangeOf(knob);
        expect(min).toBeGreaterThanOrEqual(1);
        if (knob.ours === 'max') continue;
        expect(knob.ours).toBeGreaterThanOrEqual(min);
        expect(knob.ours).toBeLessThanOrEqual(max);
        expect((knob.ours - min) % step).toBe(0);
        if (knob.kind === 'days') expect(dayChoices(knob.ours)).toContain(knob.ours);
      }
    },
  );

  it('uses standard stops when possible and finer stops for small or typed goals', () => {
    const c = challenge([
      {
        steps: [
          { exercise: 'pushup', goal: reps(5) },
          { exercise: 'plank', goal: seconds(10) },
          { exercise: 'pushup', goal: reps(3) },
          { exercise: 'plank', goal: seconds(45) },
          { exercise: 'pushup', goal: reps(200) },
        ],
        rounds: 12,
      },
    ]);
    expect(knobsOf(c).slice(0, -1).map(rangeOf)).toEqual([
      { min: 5, max: 150, step: 5 },
      { min: 10, max: 300, step: 10 },
      { min: 1, max: 150, step: 1 },
      { min: 1, max: 300, step: 1 },
      { min: 1, max: 200, step: 1 },
      { min: 1, max: 12, step: 1 },
    ]);
    expect(dayChoices(10)).toEqual([7, 10, 14, 21, 30]);
    expect(dayChoices(14)).toEqual([7, 14, 21, 30]);
  });
});

it('caps a typed circuit at 50 rounds, counting exercises and leaving recovery out of the budget', () => {
  const rounds = knobsOf(circuit).find((knob) => knob.kind === 'rounds');
  if (!rounds) throw new Error('missing rounds');
  const values = withValue(circuit, {}, rounds, 51);
  expect(values[rounds.key]).toBe(50);
  expect(setsIn(tuned(circuit, values).session)).toBe(200);
});

it('reserves the other blocks current rounds and returns capacity when they are lowered', () => {
  const [first, second] = knobsOf(twoBlocks).filter((knob) => knob.kind === 'rounds');
  let values = withValue(twoBlocks, {}, first, 190);
  values = withValue(twoBlocks, values, second, 999);
  expect(values[second.key]).toBe(10);
  expect(setsIn(tuned(twoBlocks, values).session)).toBe(200);
  values = withValue(twoBlocks, values, first, 1);
  expect(limitOf(twoBlocks, second, values)).toBe(199);
});

it.each(SUGGESTED_CHALLENGES.map(({ challenge: c }) => [c.name, c] as const))(
  '%s can be tuned to its largest counts and still saved',
  (_, c) => {
    let values = {};
    for (const knob of knobsOf(c)) {
      if (knob.kind === 'rounds' || knob.kind === 'days') values = withValue(c, values, knob, 999);
    }
    const result = tuned(c, values);
    expect(result.days).toBe(365);
    expect(setsIn(result.session)).toBeLessThanOrEqual(200);
  },
);
