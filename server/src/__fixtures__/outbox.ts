import { call } from './worker';

// A done workout as the phone's outbox holds it (`src/workout/log.ts`), and `POST /sync`.
export const set = (workoutId: string, id: string, planStep: number) => ({
  id,
  workoutId,
  planStep,
  exercise: 'squat',
  goal: { type: 'reps', n: 10 },
  reps: 10,
  noReps: 1,
  heldMs: 0,
  startedAt: 1_762_850_000_000,
  endedAt: 1_762_850_060_000,
  counterVersion: '1.0.0+ab12',
  attempts: [{ startMs: 0, bottomMs: 900, endMs: 1800, counted: true, depth: 0.9, cue: null }],
  metrics: null,
});
export const done = (id: string, runId: string | null, setIds: string[]) => ({
  entity: 'workout',
  entityId: id,
  op: 'done',
  payload: {
    workout: {
      id,
      runId,
      versionId: null,
      day: '2026-11-11',
      status: 'done',
      startedAt: 1_762_850_000_000,
      endedAt: 1_762_850_300_000,
      tzOffsetMin: 0,
      tz: 'Europe/London',
      appVersion: '1.0.0',
      sets: setIds.map((setId, i) => set(id, setId, i * 2)),
    },
    v: 1,
  },
});

type Results = { results: ({ ok: true } | { ok: false; reason: string })[] };
export async function push(cookie: string, changes: object[]) {
  const response = await call('/sync', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ changes }),
  });
  return response.ok ? response.json<Results>() : response.status;
}
