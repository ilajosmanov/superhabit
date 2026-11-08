import { describe, expect, it } from 'vite-plus/test';

import { CHALLENGES, detail, summary, totalReps, totalSeconds } from './challenges';
import { defineChallenge, MAX, reps, seconds, type Session } from '@/workout/plan';

const challenge = (session: Session) =>
  defineChallenge({ name: 'Test', days: 1, restartOnMiss: false, session });

const circuit = challenge([
  {
    steps: [
      { exercise: 'pushup', goal: reps(10) },
      { exercise: 'plank', goal: seconds(30) },
      { exercise: 'rest', goal: seconds(30) },
    ],
    rounds: 3,
  },
]);

it('describes every shipped challenge in one sentence', () => {
  expect([...CHALLENGES].map(([id, entry]) => [id, summary(entry)])).toEqual([
    ['pushup-fifty', '50 push-ups'],
    ['squat-hundred', '100 squats'],
    ['plank-minute', 'Plank 60 s'],
    ['situp-thirty', '30 sit-ups'],
    ['lunge-twenty', '20 lunges'],
    ['bridge-thirty', '30 glute bridges'],
    ['jacks-fifty', '50 jumping jacks'],
    [
      'floor-circuit',
      '3 rounds: 10 push-ups, then 15 sit-ups, then 15 glute bridges, then plank 30 s',
    ],
    ['standing-circuit', '5 rounds: 15 squats, then 20 jumping jacks'],
    [
      'floor-ladder',
      '3 push-ups, then 4 sit-ups, then 6 push-ups, then 8 sit-ups, then 9 push-ups, then 12 sit-ups, then 6 push-ups, then 8 sit-ups, then 3 push-ups, then 4 sit-ups',
    ],
    ['five-ten-fifteen', '5 rounds: 10 push-ups, then 5 rounds: 15 squats'],
    ['pushup', 'Push-ups, as many as you can'],
    ['squat', 'Squats, as many as you can'],
    ['plank', 'Plank, as long as you can'],
    ['situp', 'Sit-ups, as many as you can'],
    ['lunge', 'Lunges, as many as you can'],
    ['glute-bridge', 'Glute bridges, as many as you can'],
    ['jumping-jack', 'Jumping jacks, as many as you can'],
    ['leg-raise', 'Leg raises, as many as you can'],
    ['wall-sit', 'Wall sit, as long as you can'],
  ]);
});

describe('detail', () => {
  it('counts reps of a rep-only challenge and rotates the phone between placements', () => {
    const squatPushup = challenge([
      {
        steps: [
          { exercise: 'squat', goal: reps(3) },
          { exercise: 'pushup', goal: reps(3) },
        ],
        rounds: 1,
      },
    ]);
    expect(detail(squatPushup)).toMatchObject({
      total: 6,
      countsReps: true,
      tracking: 'The camera counts. Only full-range reps score.',
      phone: 'ROTATES',
      first: { name: 'squats' },
    });
    expect(detail(squatPushup).sets).toHaveLength(2);
  });

  it('times a hold-only challenge in seconds, phone sideways', () => {
    const plankMinute = challenge([
      { steps: [{ exercise: 'plank', goal: seconds(60) }], rounds: 1 },
    ]);
    expect(detail(plankMinute)).toMatchObject({
      total: 60,
      countsReps: false,
      tracking: 'The camera times your hold. Stay in position to keep the clock running.',
      phone: 'SIDEWAYS',
    });
  });

  it('counts reps and times holds in a mixed circuit, leaving rests out of the sets', () => {
    expect(detail(circuit)).toMatchObject({
      total: 30,
      countsReps: true,
      tracking: 'The camera counts full-range reps and times your holds.',
      phone: 'SIDEWAYS',
    });
    expect(detail(circuit).sets.map((set) => set.exercise)).toEqual([
      'pushup',
      'plank',
      'pushup',
      'plank',
      'pushup',
      'plank',
    ]);
  });

  it('keeps the phone upright for a standing exercise', () => {
    expect(
      detail(challenge([{ steps: [{ exercise: 'squat', goal: MAX }], rounds: 1 }])).phone,
    ).toBe('UPRIGHT');
  });
});

describe('summary', () => {
  it('lists counted sets in order', () => {
    expect(
      summary(
        challenge([
          {
            steps: [
              { exercise: 'squat', goal: reps(3) },
              { exercise: 'pushup', goal: reps(3) },
            ],
            rounds: 1,
          },
        ]),
      ),
    ).toBe('3 squats, then 3 push-ups');
  });

  it('capitalises an open-ended first set', () => {
    expect(summary(challenge([{ steps: [{ exercise: 'pushup', goal: MAX }], rounds: 1 }]))).toBe(
      'Push-ups, as many as you can',
    );
    expect(summary(challenge([{ steps: [{ exercise: 'squat', goal: MAX }], rounds: 1 }]))).toBe(
      'Squats, as many as you can',
    );
  });

  it('describes an open-ended hold by duration', () => {
    expect(summary(challenge([{ steps: [{ exercise: 'plank', goal: MAX }], rounds: 1 }]))).toBe(
      'Plank, as long as you can',
    );
  });

  it('describes repeated blocks once and omits rests', () => {
    expect(summary(circuit)).toBe('3 rounds: 10 push-ups, then plank 30 s');
  });

  it("preserves block order and each block's round count", () => {
    expect(
      summary(
        challenge([
          { steps: [{ exercise: 'squat', goal: reps(3) }], rounds: 2 },
          { steps: [{ exercise: 'pushup', goal: reps(1) }], rounds: 1 },
        ]),
      ),
    ).toBe('2 rounds: 3 squats, then 1 push-ups');
  });
});

describe('totals', () => {
  it('sums rep goals, and an open-ended rep goal makes them unlimited', () => {
    const squat = { exercise: 'squat', goal: reps(3) } as const;
    expect(
      totalReps(challenge([{ steps: [squat, { exercise: 'pushup', goal: reps(3) }], rounds: 1 }])),
    ).toBe(6);
    expect(
      totalReps(challenge([{ steps: [squat, { exercise: 'pushup', goal: MAX }], rounds: 1 }])),
    ).toBe(Infinity);
  });

  it('multiplies goals by rounds and excludes holds and rests from reps', () => {
    expect(totalReps(circuit)).toBe(30);
    expect(totalSeconds(circuit)).toBe(90);
  });

  it('makes a hold-only MAX challenge unlimited in seconds, with no reps', () => {
    const hold = challenge([{ steps: [{ exercise: 'plank', goal: MAX }], rounds: 1 }]);
    expect(totalReps(hold)).toBe(0);
    expect(totalSeconds(hold)).toBe(Infinity);
  });

  it('keeps mixed timed and MAX holds unlimited across rounds', () => {
    const mixed = challenge([
      {
        steps: [
          { exercise: 'plank', goal: MAX },
          { exercise: 'rest', goal: MAX },
          { exercise: 'squat', goal: reps(10) },
          { exercise: 'plank', goal: seconds(20) },
        ],
        rounds: 2,
      },
    ]);
    expect(totalReps(mixed)).toBe(20);
    expect(totalSeconds(mixed)).toBe(Infinity);
  });

  it('excludes rep goals and MAX rests from hold seconds', () => {
    const mixed = challenge([
      {
        steps: [
          { exercise: 'plank', goal: seconds(20) },
          { exercise: 'rest', goal: MAX },
          { exercise: 'squat', goal: MAX },
        ],
        rounds: 2,
      },
    ]);
    expect(totalSeconds(mixed)).toBe(40);
  });
});
