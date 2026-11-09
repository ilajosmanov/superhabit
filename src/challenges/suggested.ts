import { defineChallenge, reps, seconds, type Challenge, type Step } from '@/workout/plan';

const rest = (n: number) => ({ exercise: 'rest', goal: seconds(n) }) as const;
/** A ladder rung: n push-ups, n sit-ups, then whatever follows (a rest, except on the last rung). */
const rung = (n: number, ...then: Step[]): Challenge['session'][number] => ({
  steps: [{ exercise: 'pushup', goal: reps(n) }, { exercise: 'situp', goal: reps(n) }, ...then],
  rounds: 1,
});

/** Who owns the suggested challenges. */
export const OURS = 'superhabit';

/**
 * Ours, joined as-is, in catalog order; seeded into the database at every start. The ids are fixed so
 * every phone and the server agree. To change one, give it a new `versionId` (a fresh uuid): the seed adds
 * that version and makes it current, and runs pinned to the old one keep it.
 */
export type Suggested = { id: string; versionId: string; challenge: Challenge };

// shortcut: testing goals, a minute or two each; the real ones (and the daily basics) are at git tag
// `real-goals`. Put them back, as new versions, before pilot users get the app.
const suggested: Suggested[] = [
  // Circuits keep the phone in one spot, or move it once.
  {
    id: 'af715bf8-07f9-48f7-90cc-e0bac035203b',
    versionId: '34c9627b-421d-4489-8f3b-7b1bc9428ff9',
    challenge: {
      name: 'Floor circuit',
      days: 14,
      restartOnMiss: false,
      dailyTotal: false,
      session: [
        {
          steps: [
            { exercise: 'pushup', goal: reps(3) },
            { exercise: 'situp', goal: reps(3) },
            { exercise: 'glute-bridge', goal: reps(3) },
            { exercise: 'plank', goal: seconds(10) },
            rest(10),
          ],
          rounds: 2,
        },
      ],
    },
  },
  {
    id: '82c190c8-9817-4ad6-b45e-51047c32609b',
    versionId: '8f350b6b-4e2e-4e39-a180-c7d381f6c54f',
    challenge: {
      name: 'Standing circuit',
      days: 14,
      restartOnMiss: false,
      dailyTotal: false,
      session: [
        {
          steps: [
            { exercise: 'squat', goal: reps(3) },
            { exercise: 'jumping-jack', goal: reps(5) },
            rest(10),
          ],
          rounds: 2,
        },
      ],
    },
  },
  {
    id: 'f0a877b1-0ad2-4c7e-a660-67182ecaa52b',
    versionId: 'e435c0ed-ff03-4742-8267-afb93ce7c221',
    challenge: {
      name: 'Floor ladder',
      days: 14,
      restartOnMiss: false,
      dailyTotal: false,
      // Climbs to 2 push-ups and 2 sit-ups and back down.
      session: [rung(1, rest(10)), rung(2, rest(10)), rung(1)],
    },
  },
  // Cindy's push-ups and squats without the bar or the clock; the phone moves once, between blocks.
  {
    id: '7ec21369-3b9a-4d95-9c17-2a89751a34c0',
    versionId: 'f9a7cb8e-7e66-4871-8902-59e5843ffaf4',
    challenge: {
      name: '5-10-15',
      days: 14,
      restartOnMiss: false,
      dailyTotal: false,
      session: [
        { steps: [{ exercise: 'pushup', goal: reps(3) }, rest(10)], rounds: 2 },
        { steps: [{ exercise: 'squat', goal: reps(3) }, rest(10)], rounds: 2 },
      ],
    },
  },
];

export const SUGGESTED_CHALLENGES: readonly Suggested[] = suggested.map((entry) => ({
  ...entry,
  challenge: defineChallenge(entry.challenge),
}));
