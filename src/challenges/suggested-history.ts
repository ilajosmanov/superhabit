import { defineChallenge, type Challenge } from '@/workout/plan/plan';
import { weeklySchedule } from '@/workout/plan/schedule';
import { circuit, exerciseSet, ladder, session, sets } from '@/workout/plan/structures';

/**
 * Frozen prescriptions previously shipped or seeded. Keep their ids and payloads unchanged so runs
 * restored from another phone retain their original workload and calendar. New versions live in
 * suggested.ts; when replacing one there, preserve its previous payload here too.
 */
type Suggested = { id: string; versionId: string; challenge: Challenge };

// Historical testing workloads. Do not edit: joined runs may still reference these versions.
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
      session: circuit({
        exercises: [
          exerciseSet('pushup', 3),
          exerciseSet('situp', 3),
          exerciseSet('glute-bridge', 3),
          exerciseSet('plank', 10),
        ],
        rounds: 2,
        restBetweenRounds: 10,
      }),
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
      session: circuit({
        exercises: [exerciseSet('squat', 3), exerciseSet('jumping-jack', 5)],
        rounds: 2,
        restBetweenRounds: 10,
      }),
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
      session: ladder({
        rungs: [1, 2, 1],
        exercises: (n) => [exerciseSet('pushup', n), exerciseSet('situp', n)],
        restBetweenRungs: 10,
      }),
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
      session: session(
        sets({ exercise: exerciseSet('pushup', 3), rounds: 2, restBetweenSets: 10 }),
        sets({ exercise: exerciseSet('squat', 3), rounds: 2, restBetweenSets: 10 }),
      ),
    },
  },
  // The five-move daily fifty, with an original name. Lunges count individual reps, either leg.
  {
    id: '66755858-0c93-4950-9a4b-01e15bac19ad',
    versionId: '6facf809-8978-40ef-9281-21c7e3c7b71a',
    challenge: {
      name: 'Fifty all round',
      days: 14,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [
          exerciseSet('squat', 50),
          exerciseSet('lunge', 50),
          exerciseSet('pushup', 50),
          exerciseSet('wall-sit', 50),
          exerciseSet('plank', 50),
        ],
      }),
    },
  },
  // Adapted seven-minute shape: rep targets make duration variable; side plank waits for tuning.
  {
    id: '39d72820-8648-42d4-93e9-a31f49f53dbe',
    versionId: 'dae0aa51-f50f-453a-82ff-f0b4f7751110',
    challenge: {
      name: 'Short bodyweight circuit',
      days: 14,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [
          exerciseSet('jumping-jack', 15),
          exerciseSet('wall-sit', 30),
          exerciseSet('pushup', 15),
          exerciseSet('situp', 15),
          exerciseSet('squat', 15),
          exerciseSet('plank', 30),
          exerciseSet('lunge', 15),
        ],
        restBetweenExercises: 10,
      }),
    },
  },
  // Four moves × 20 × 10 is 800, not 1000. A standalone challenge to repeat when wanted, not a weekly schedule.
  {
    id: 'dca8f88d-d81f-4ba2-9c72-7289e8b95dde',
    versionId: 'a2e36a1f-99f6-4d14-a11e-a2e0a9494df6',
    challenge: {
      name: '800 reps',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [
          exerciseSet('pushup', 20),
          exerciseSet('squat', 20),
          exerciseSet('situp', 20),
          exerciseSet('lunge', 20),
        ],
        rounds: 10,
        restBetweenRounds: 60,
      }),
    },
  },
  {
    id: 'e34c2ee7-b310-4b60-bd19-0261e001c544',
    versionId: 'd16ade32-d2a3-4c4b-af92-3e7e9f0e24db',
    challenge: {
      name: 'Push-up squat crossover',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: ladder({
        rungs: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        exercises: (n) => [exerciseSet('pushup', n), exerciseSet('squat', 11 - n)],
        restBetweenRungs: 20,
      }),
    },
  },
  // Burpee suggestions use the existing counter; its timing still needs device-clip tuning (exercises/burpee.ts).
  {
    id: '8121af65-478e-4cbb-af2a-64e4bcaa5d86',
    versionId: '31e05999-4d00-4434-8177-a5eebd3c03b5',
    challenge: {
      name: 'Down the ladder',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: ladder({
        rungs: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        exercises: (n) => [
          exerciseSet('burpee', n),
          exerciseSet('pushup', n),
          exerciseSet('squat', n),
        ],
        restBetweenRungs: 20,
      }),
    },
  },
  // The top rung occurs once.
  {
    id: '6c6677e7-3c4c-4357-9e32-98b0ea723774',
    versionId: '7a3cd396-7fcb-4a69-928d-06b1c7fac157',
    challenge: {
      name: 'Squat burpee ladder',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: ladder({
        rungs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        exercises: (n) => [exerciseSet('squat', n), exerciseSet('burpee', n)],
        restBetweenRungs: 20,
      }),
    },
  },
  // Untimed two-move version; optional burpees and sit-ups are left out.
  {
    id: '3bdef5bb-03e4-4fb8-b152-b3f14a5025ab',
    versionId: '7c1d7a9a-e96d-47fe-9a37-63f0a44ce8ae',
    challenge: {
      name: '21-15-9',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: ladder({
        rungs: [21, 15, 9],
        exercises: (n) => [exerciseSet('squat', n), exerciseSet('pushup', n)],
        restBetweenRungs: 30,
      }),
    },
  },
  // Eight fixed rounds, not AMRAP. Different exercises and ordering from the existing 5-10-15.
  {
    id: '590f79b1-eaa8-4f22-8dfb-4c77afe21748',
    versionId: 'a63bf178-602e-491d-9110-626d77fec4fd',
    challenge: {
      name: 'Burpee 5-10-15',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [exerciseSet('burpee', 5), exerciseSet('situp', 10), exerciseSet('squat', 15)],
        rounds: 8,
        restBetweenRounds: 30,
      }),
    },
  },
  // Twenty alternating rounds; no running, pull-ups, or borrowed hero name.
  {
    id: '4db91547-8f14-46bf-b3d4-02a952dd44c3',
    versionId: '2a786c71-e7eb-42fb-a2e5-57331a0eb1bc',
    challenge: {
      name: 'Push-up squat twenty',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [exerciseSet('pushup', 10), exerciseSet('squat', 15)],
        rounds: 20,
        restBetweenRounds: 30,
      }),
    },
  },
  {
    id: 'f0be3465-3320-4883-a354-7fe12861600f',
    versionId: '2271da2c-b478-4b19-9024-6876232d942a',
    challenge: {
      name: 'Core and glutes',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [
          exerciseSet('plank', 60),
          exerciseSet('squat', 50),
          exerciseSet('situp', 40),
          exerciseSet('glute-bridge', 30),
        ],
        rounds: 2,
        restBetweenRounds: 60,
      }),
    },
  },
  // Side plank omitted until tuned.
  {
    id: 'dad1966e-fe2d-4644-b561-5e8a8d52fdde',
    versionId: '1f2a3b31-8c21-4fa6-b061-3749a052e275',
    challenge: {
      name: 'Ab circuit',
      days: 14,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [
          exerciseSet('situp', 15),
          exerciseSet('leg-raise', 15),
          exerciseSet('plank', 30),
        ],
        rounds: 3,
        restBetweenRounds: 30,
      }),
    },
  },
  // Regular push-ups, no runs; this is a drill, not an official test.
  {
    id: 'ce56086f-c150-4fb7-8fbb-2c7008d7b8a3',
    versionId: '1412f967-e74e-4e02-a5ce-ab8b3b6cf3d5',
    challenge: {
      name: 'PT test drill',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [exerciseSet('pushup', 20), exerciseSet('situp', 40), exerciseSet('plank', 60)],
        rounds: 5,
        restBetweenRounds: 60,
      }),
    },
  },
  // shortcut: 40 total lunges, not enforced 20 per leg. Add side-aware counting before promising per-leg goals.
  {
    id: '9f61ac1c-da1f-470d-83ac-be5c7d24e504',
    versionId: '0564bee6-e384-453f-a31b-914cba01eac5',
    challenge: {
      name: 'Lunges and squats',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [exerciseSet('lunge', 40), exerciseSet('squat', 20)],
        rounds: 3,
        restBetweenRounds: 30,
      }),
    },
  },
  {
    id: 'a3743d6a-3fef-41c1-a27c-dd38b1f23f59',
    versionId: '36d4f76d-8672-46d5-80dd-7300ec4807bd',
    challenge: {
      name: '100 push-ups a day',
      days: 30,
      restartOnMiss: false,
      dailyTotal: true,
      session: sets({ exercise: exerciseSet('pushup', 100) }),
    },
  },
  {
    id: '7892129b-c36a-42b2-b7f3-97194d66cb62',
    versionId: 'bc5431ce-2cbe-4532-9292-ed292c93983a',
    challenge: {
      name: '100 squats a day',
      days: 30,
      restartOnMiss: false,
      dailyTotal: true,
      session: sets({ exercise: exerciseSet('squat', 100) }),
    },
  },
  {
    id: '5990ed0e-207a-4a77-9fcd-0380b62728f9',
    versionId: 'e6055fd8-6161-41ce-ade4-f7da0d759e69',
    challenge: {
      name: '22 push-ups for 22 days',
      days: 22,
      restartOnMiss: false,
      dailyTotal: true,
      session: sets({ exercise: exerciseSet('pushup', 22) }),
    },
  },
  // One session. Multi-exercise totals accumulated across separate workouts are not supported.
  {
    id: '1a0eceb2-fc94-4e27-b81c-9222e827a6c2',
    versionId: '5efeeb62-ae3b-4236-9b29-d4dae0f6ede8',
    challenge: {
      name: '100/100/100',
      days: 1,
      restartOnMiss: false,
      dailyTotal: false,
      session: circuit({
        exercises: [
          exerciseSet('pushup', 100),
          exerciseSet('squat', 100),
          exerciseSet('situp', 100),
        ],
      }),
    },
  },
];

// Training frequency follows NSCA's nonconsecutive-day guidance; the 2–4 week durations are
// our adjustable product defaults, not published prescriptions for these adapted routines.
// Higher-volume routines get two sessions per week. The 800/500/300-rep benchmarks stay one-off.
const calendars: Record<string, { versionId: string; days: number; training: readonly number[] }> =
  {
    'Floor circuit': {
      versionId: '693b99ed-52bc-4c48-aa10-934a7c2ec900',
      days: 14,
      training: [1, 3, 5],
    },
    'Standing circuit': {
      versionId: 'af38b88f-07a3-4886-adb4-22f85fcb4dac',
      days: 14,
      training: [1, 3, 5],
    },
    'Floor ladder': {
      versionId: 'e4b74ed2-c232-4a28-a7b0-3d1fb554da8a',
      days: 14,
      training: [1, 3, 5],
    },
    '5-10-15': { versionId: '616d3b8f-1751-4081-8d31-d4a4c62a2a18', days: 14, training: [1, 3, 5] },
    'Fifty all round': {
      versionId: '4c85195a-2ca0-4486-9efc-b9fc712abd50',
      days: 14,
      training: [1, 3, 5],
    },
    'Short bodyweight circuit': {
      versionId: 'f8a88f06-e3e7-4a97-aafd-f9cb130b8b60',
      days: 14,
      training: [1, 3, 5],
    },
    'Push-up squat crossover': {
      versionId: 'bea2153c-34bc-432b-9b31-ecf72e1b761a',
      days: 21,
      training: [1, 3, 5],
    },
    'Down the ladder': {
      versionId: 'd3f4d86b-1fa4-48c6-876b-e9dc1f74e4f5',
      days: 28,
      training: [1, 4],
    },
    'Squat burpee ladder': {
      versionId: '9b2be0cf-e44e-4dcd-9e94-459644bfa5b9',
      days: 28,
      training: [1, 4],
    },
    '21-15-9': { versionId: '23ced5d3-e9b8-4021-839b-39b1a31bbac7', days: 21, training: [1, 3, 5] },
    'Burpee 5-10-15': {
      versionId: '6483d565-1ad0-4502-8ce8-92000c736f0a',
      days: 28,
      training: [1, 4],
    },
    'Core and glutes': {
      versionId: '1c086493-ae5f-4248-b35f-a58a8324233a',
      days: 28,
      training: [1, 4],
    },
    'Ab circuit': {
      versionId: '5833d7a9-7f3d-48a5-924c-834425208df8',
      days: 21,
      training: [1, 3, 5],
    },
    'PT test drill': {
      versionId: '3467150b-3970-43c2-8359-9c105075d638',
      days: 28,
      training: [1, 4],
    },
    'Lunges and squats': {
      versionId: 'cb788ad3-6985-44f1-8376-80c5a30819b5',
      days: 21,
      training: [1, 4],
    },
  };

export const PREVIOUS_SUGGESTIONS: readonly Suggested[] = suggested.map((entry) => {
  const calendar = calendars[entry.challenge.name];
  return {
    ...entry,
    versionId: calendar?.versionId ?? entry.versionId,
    challenge: defineChallenge(
      calendar
        ? {
            ...entry.challenge,
            days: calendar.days,
            schedule: weeklySchedule(calendar.days, calendar.training),
          }
        : entry.challenge,
    ),
  };
});

/** Replaced versions remain available for joined runs restored on another phone. */
export const EARLIER_SUGGESTIONS: readonly Suggested[] = suggested.filter(
  (entry) => calendars[entry.challenge.name],
);
