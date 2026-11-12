import { describe, expect, it } from 'vite-plus/test';

import { SUGGESTED_CHALLENGES } from './suggested';
import { dayChoices, knobsOf, rangeOf, tuned, valueOf } from './tune';
import { defineChallenge, MAX, reps, seconds, type Session } from '@/workout/plan/plan';

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
  it('offers circuit exercise numbers and rounds once, then days, leaving out rests', () => {
    expect(knobsOf(circuit)).toMatchObject([
      { kind: 'reps', exercise: 'pushup', block: 0, ours: 10 },
      { kind: 'reps', exercise: 'situp', block: 0, ours: 15 },
      { kind: 'reps', exercise: 'glute-bridge', block: 0, ours: 15 },
      { kind: 'seconds', exercise: 'plank', block: 0, ours: 30 },
      { kind: 'rounds', block: 0, ours: 3 },
      { key: 'days', kind: 'days', ours: 14 },
    ]);
  });

  it('offers each block in session order with distinct keys', () => {
    const knobs = knobsOf(twoBlocks);
    expect(knobs).toMatchObject([
      { kind: 'reps', exercise: 'pushup', block: 0, ours: 10 },
      { kind: 'rounds', block: 0, ours: 5 },
      { kind: 'reps', exercise: 'squat', block: 1, ours: 15 },
      { kind: 'rounds', block: 1, ours: 5 },
      { kind: 'days', ours: 14 },
    ]);
    expect(new Set(knobs.map(({ key }) => key)).size).toBe(5);
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
    expect(knobs).toHaveLength(7);
    const values = {
      [knobs[0].key]: 7,
      [knobs[1].key]: 25,
      [knobs[2].key]: 4,
      [knobs[5].key]: 2,
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
    expect(knobs.map((knob) => valueOf(knob, values))).toEqual([7, 25, 4, 1, 'max', 2, 21]);
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
    const rounds = knobsOf(circuit)[4];
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
