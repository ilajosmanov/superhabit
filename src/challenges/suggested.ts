import { EARLIER_SUGGESTIONS, PREVIOUS_SUGGESTIONS } from './suggested-history';
import { defineChallenge, type Challenge } from '@/workout/plan/plan';
import { circuit, exerciseSet, ladder } from '@/workout/plan/structures';

export const OURS = 'superhabit';

/** Fixed identities shared by the app and server. Keep replaced prescriptions in history. */
type Suggested = { id: string; versionId: string; challenge: Challenge };
export const SUGGESTED_GROUPS = ['Training', 'Advanced challenges', 'Daily goals'] as const;
type Group = (typeof SUGGESTED_GROUPS)[number];
type Guidance = { group: Group; description: string };

const revisions: Record<string, { versionId: string; changes: Partial<Challenge> }> = {
  'Floor circuit': {
    versionId: '9d10c725-4dcb-45ca-8580-31641a4f1a14',
    changes: {
      session: circuit({
        exercises: [
          exerciseSet('pushup', 10),
          exerciseSet('situp', 15),
          exerciseSet('glute-bridge', 15),
          exerciseSet('plank', 30),
        ],
        rounds: 3,
        restBetweenRounds: 60,
      }),
    },
  },
  'Standing circuit': {
    versionId: 'edbd6c69-4c15-41c8-92d1-85a6ea88fd34',
    changes: {
      session: circuit({
        exercises: [exerciseSet('squat', 15), exerciseSet('jumping-jack', 20)],
        rounds: 3,
        restBetweenRounds: 30,
      }),
    },
  },
  'Floor ladder': {
    versionId: '5b6df25b-8adb-45f9-a429-1bbf295cb92c',
    changes: {
      session: ladder({
        rungs: [1, 2, 3, 2, 1],
        exercises: (n) => [exerciseSet('pushup', 3 * n), exerciseSet('situp', 4 * n)],
        restBetweenRungs: 30,
      }),
    },
  },
  '5-10-15': {
    versionId: '5fc0d783-cc5c-4a71-9cb6-5d086c8610ae',
    changes: {
      name: 'Push-up squat rounds',
      session: circuit({
        exercises: [exerciseSet('pushup', 10), exerciseSet('squat', 15)],
        rounds: 5,
        restBetweenRounds: 30,
      }),
    },
  },
  'Down the ladder': {
    versionId: 'bc2bfcae-dd5f-48b3-8469-2a707e04c348',
    changes: {
      session: ladder({
        rungs: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        exercises: (n) => [
          exerciseSet('burpee', n),
          exerciseSet('squat', n),
          exerciseSet('pushup', n),
        ],
        restBetweenRungs: 20,
      }),
    },
  },
  'Squat burpee ladder': {
    versionId: '6318aa48-fb27-41f2-b965-b6712fbc0521',
    changes: {
      session: ladder({
        rungs: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        exercises: (n) => [exerciseSet('squat', n), exerciseSet('burpee', n)],
        restBetweenRungs: 20,
      }),
    },
  },
  'PT test drill': {
    versionId: '35221e09-057d-47f9-b11a-4ecae3391ca7',
    changes: { name: 'Push-up and core endurance' },
  },
};

const guidance: Record<string, Guidance> = {
  'Floor circuit': {
    group: 'Training',
    description:
      'Three rounds of pushing, core and glute work. Keep each rep controlled; lower reps or rounds if form starts to slip.',
  },
  'Standing circuit': {
    group: 'Training',
    description:
      'Alternate squats and jumping jacks for three rounds. Start with fewer reps or rounds if you need more recovery.',
  },
  'Floor ladder': {
    group: 'Training',
    description:
      'Alternate push-ups and sit-ups as the targets rise, then fall. Rest after each pair; adjust the rungs to keep good form.',
  },
  'Push-up squat rounds': {
    group: 'Training',
    description:
      'Alternate upper- and lower-body work: push-ups, squats, then rest. Five fixed rounds, with adjustable reps and recovery.',
  },
  'Fifty all round': {
    group: 'Advanced challenges',
    description:
      'A high-volume full-body session. The 50 lunges are total: aim for 25 per leg. Break up the reps with rests when needed, or lower the targets before joining.',
  },
  'Short bodyweight circuit': {
    group: 'Training',
    description:
      'A shortened bodyweight circuit with fixed reps and holds. Move through the stations in order; this adaptation has no seven-minute target.',
  },
  '800 reps': {
    group: 'Advanced challenges',
    description:
      'An 800-rep completion challenge across ten rounds. Build up to this volume; reduce rounds and take enough recovery to keep good form.',
  },
  'Push-up squat crossover': {
    group: 'Training',
    description:
      'Push-ups decrease from 10 to 1 while squats increase from 1 to 10. Complete each pair before moving on: 55 reps of each in total.',
  },
  'Down the ladder': {
    group: 'Advanced challenges',
    description:
      'Ten of each, then nine, down to one. Squats separate burpees and push-ups within each rung. Lower the larger rungs or extend recovery if needed.',
  },
  'Squat burpee ladder': {
    group: 'Advanced challenges',
    description:
      'Pair squats and burpees from 10 each down to 1: 55 of each. Rest after each pair and scale the rungs to your current ability.',
  },
  'Squat burpee pyramid': {
    group: 'Advanced challenges',
    description:
      'Climb from 1 to 10, then descend to 1, counting the peak once: 100 squats and 100 burpees. A longer alternative to the descending ladder.',
  },
  '21-15-9': {
    group: 'Training',
    description:
      'Complete squats and push-ups at 21 each, then 15, then 9. This is an untimed adaptation; choose targets that let you keep good form.',
  },
  'Burpee 5-10-15': {
    group: 'Advanced challenges',
    description:
      'Five burpees, ten sit-ups, fifteen squats per round. This adaptation uses eight fixed rounds instead of a timed AMRAP. Start with fewer rounds if needed.',
  },
  'Push-up squat twenty': {
    group: 'Advanced challenges',
    description:
      'Twenty alternating rounds total 200 push-ups and 300 squats. An endurance benchmark: reduce the rounds before joining if this exceeds your usual workload.',
  },
  'Core and glutes': {
    group: 'Advanced challenges',
    description:
      'Two rounds of plank, squats, sit-ups and glute bridges. Use steady, controlled reps and pause briefly at the top of each bridge. Scale the large sets as needed.',
  },
  'Ab circuit': {
    group: 'Training',
    description:
      'Three rounds of sit-ups, leg raises and plank. Stop each set before you lose control of your position; reduce reps or hold time as needed.',
  },
  'Push-up and core endurance': {
    group: 'Advanced challenges',
    description:
      'Five rounds of push-ups, sit-ups and plank. An endurance session, not an official fitness test. Reduce rounds or targets to match your experience.',
  },
  'Lunges and squats': {
    group: 'Training',
    description:
      'Forty lunges total, aiming for 20 per leg, then 20 squats. Repeat for three rounds. The counter counts either leg, so keep the sides balanced yourself.',
  },
  '100 push-ups a day': {
    group: 'Daily goals',
    description:
      'An optional daily rep goal, split across the day. It is not a strength progression plan. Choose a sustainable target and allow recovery when needed.',
  },
  '100 squats a day': {
    group: 'Daily goals',
    description:
      'An optional daily rep goal, split across the day. It is not a strength progression plan. Choose a sustainable target and allow recovery when needed.',
  },
  '22 push-ups for 22 days': {
    group: 'Daily goals',
    description:
      'A 22-day participation goal, with reps you can split across the day. Adjust the target to your ability; this is not a progressive training program.',
  },
  '100/100/100': {
    group: 'Advanced challenges',
    description:
      'A completion benchmark: 100 push-ups, 100 squats, then 100 sit-ups. Break each target into smaller efforts with recovery as needed; lower the targets before joining if necessary.',
  },
};

const current: Suggested[] = PREVIOUS_SUGGESTIONS.map((entry) => {
  const revision = revisions[entry.challenge.name];
  return revision
    ? {
        ...entry,
        versionId: revision.versionId,
        challenge: defineChallenge({ ...entry.challenge, ...revision.changes }),
      }
    : entry;
});
const pyramid = PREVIOUS_SUGGESTIONS.find(
  ({ challenge }) => challenge.name === 'Squat burpee ladder',
);
if (!pyramid) throw new Error('Missing original squat burpee pyramid');
current.splice(current.findIndex(({ id }) => id === pyramid.id) + 1, 0, {
  id: 'c5f8246e-17f0-44f5-855a-9113d622b78c',
  versionId: '2a644e92-47e7-48f8-a7db-01c4099fc72f',
  challenge: defineChallenge({ ...pyramid.challenge, name: 'Squat burpee pyramid' }),
});

export const SUGGESTED_CHALLENGES: readonly (Suggested & Guidance)[] = current.map((entry) => {
  const info = guidance[entry.challenge.name];
  if (!info) throw new Error(`Missing guidance for ${entry.challenge.name}`);
  return { ...entry, ...info };
});

/** Old names, workloads and calendars must remain readable on a fresh install. */
export const SUGGESTED_HISTORY: readonly Suggested[] = [
  ...EARLIER_SUGGESTIONS,
  ...PREVIOUS_SUGGESTIONS.filter(({ challenge }) => revisions[challenge.name]),
];
