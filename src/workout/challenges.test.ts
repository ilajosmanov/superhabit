import { describe, expect, it } from 'vite-plus/test';

import { challengeDay, CHALLENGES, summary, totalReps, totalSeconds } from './challenges';
import { defineChallenge, expand, MAX, reps, seconds, validate, type Session } from './plan';

describe('challengeDay', () => {
  const allDone = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  const missedThird = new Set(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05']);

  it.each([false, true])('counts calendar days with no misses (restart %s)', (restartOnMiss) => {
    expect(challengeDay({ days: 30, restartOnMiss }, '2026-11-01', allDone, '2026-11-06')).toEqual({
      day: 6,
      from: '2026-11-01',
    });
  });

  it('leaves a missed day empty when restart is disabled', () => {
    expect(
      challengeDay({ days: 30, restartOnMiss: false }, '2026-11-01', missedThird, '2026-11-06'),
    ).toEqual({ day: 6, from: '2026-11-01' });
  });

  it('restarts the day after a miss', () => {
    expect(
      challengeDay({ days: 30, restartOnMiss: true }, '2026-11-01', missedThird, '2026-11-06'),
    ).toEqual({ day: 3, from: '2026-11-04' });
  });

  it('returns null after the end date without restart, even with a miss', () => {
    for (const done of [allDone, missedThird]) {
      expect(
        challengeDay({ days: 5, restartOnMiss: false }, '2026-11-01', done, '2026-11-06'),
      ).toBeNull();
    }
  });

  it('never restarts a finished run after later missed days', () => {
    expect(
      challengeDay(
        { days: 3, restartOnMiss: true },
        '2026-11-01',
        new Set(['2026-11-01', '2026-11-02', '2026-11-03']),
        '2026-11-06',
      ),
    ).toBeNull();
  });

  it('includes the last day but returns null on the next day', () => {
    const c = { days: 3, restartOnMiss: true };
    const done = new Set(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(challengeDay(c, '2026-11-01', done, '2026-11-03')).toEqual({
      day: 3,
      from: '2026-11-01',
    });
    expect(challengeDay(c, '2026-11-01', done, '2026-11-04')).toBeNull();
  });

  it('counts through the spring DST change without losing a day', () => {
    expect(
      challengeDay({ days: 30, restartOnMiss: false }, '2026-03-27', new Set(), '2026-03-31'),
    ).toEqual({ day: 5, from: '2026-03-27' });
  });

  it('starts at day one and does not treat today as missed', () => {
    expect(
      challengeDay({ days: 1, restartOnMiss: true }, '2026-11-01', new Set(), '2026-11-01'),
    ).toEqual({ day: 1, from: '2026-11-01' });
  });

  it('restarts again on consecutive misses, including across a month boundary', () => {
    expect(
      challengeDay({ days: 3, restartOnMiss: true }, '2026-10-30', new Set(), '2026-11-02'),
    ).toEqual({ day: 1, from: '2026-11-02' });
  });

  it('returns null before the start date', () => {
    expect(
      challengeDay({ days: 30, restartOnMiss: false }, '2026-11-01', new Set(), '2026-10-31'),
    ).toBeNull();
  });
});

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

describe('CHALLENGES', () => {
  it.each([...CHALLENGES])('%s has a valid plan', (_id, entry) => {
    expect(validate(entry.session)).toEqual([]);
  });

  it('keeps the existing catalog order and sets the challenge durations', () => {
    expect([...CHALLENGES].map(([id, entry]) => [id, entry.days, entry.restartOnMiss])).toEqual([
      ['squat-pushup', 30, false],
      ['plank-minute', 21, false],
      ['floor-circuit', 30, false],
      ['two-max-sets', 14, false],
      ['squat-hundred', 21, false],
      ['pushup-fifty', 21, false],
      ['jumping-jack-max', 14, false],
      ['lunge-max', 14, false],
      ['situp-max', 14, false],
      ['glute-bridge-max', 14, false],
      ['mountain-climber-max', 14, false],
      ['squat', 1, false],
      ['pushup', 1, false],
    ]);
  });

  it.each([
    {
      id: 'plank-minute',
      description: 'Plank 60 s',
      reps: 0,
      seconds: 60,
      exercises: ['plank'],
      rests: [],
    },
    {
      id: 'floor-circuit',
      description: '3 rounds: 10 push-ups, then plank 30 s',
      reps: 30,
      seconds: 90,
      exercises: ['pushup', 'plank', 'pushup', 'plank', 'pushup', 'plank'],
      rests: [30, 30],
    },
    {
      id: 'two-max-sets',
      description: '2 rounds: squats, as many as you can',
      reps: Infinity,
      seconds: 0,
      exercises: ['squat', 'squat'],
      rests: [60],
    },
  ])('$id offers its catalog goals and rests', (expected) => {
    const entry = CHALLENGES.get(expected.id);
    if (!entry) throw new Error(`Missing challenge: ${expected.id}`);
    expect(summary(entry)).toBe(expected.description);
    expect(totalReps(entry)).toBe(expected.reps);
    expect(totalSeconds(entry)).toBe(expected.seconds);
    const steps = expand(entry.session);
    expect(steps.filter((step) => step.exercise !== 'rest').map((step) => step.exercise)).toEqual(
      expected.exercises,
    );
    expect(
      steps
        .filter((step) => step.exercise === 'rest')
        .map((step) => (step.goal.type === 'seconds' ? step.goal.n : null)),
    ).toEqual(expected.rests);
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
