import { describe, expect, it } from 'vite-plus/test';

import {
  create,
  done,
  edit,
  freeze,
  join,
  leave,
  push,
  set,
  version,
} from '../__fixtures__/outbox';
import { call, env, passedBeforeLimit, someone } from '../__fixtures__/worker';

type Page = {
  rows: { entity: string; row: Record<string, unknown> }[];
  cursor: number;
  more: boolean;
};
async function pull(cookie: string, after: number | string = 0) {
  const response = await call(`/sync?after=${after}`, { headers: { cookie } });
  return response.ok ? response.json<Page>() : response.status;
}
const page = async (cookie: string, after?: number) => {
  const answer = await pull(cookie, after);
  if (typeof answer === 'number') throw new Error(`pull answered ${answer}`);
  return answer;
};
const rows = async (table: string, userId: string) =>
  (await env.DB.prepare(`select * from ${table} where user_id = ?`).bind(userId).all()).results;

describe('sync: the phone sends its outbox', () => {
  it('archives only your challenge, syncs that archive, and keeps it through retries and offline edits', async () => {
    const { cookie: phone, id: you } = await someone();
    const archive = {
      entity: 'challenge',
      entityId: 'archived',
      op: 'archive',
      payload: { retiredAt: 1234, v: 1 },
    };
    await push(phone, [create('archived', 'a-v1'), join('a-run', 'archived')]);
    const first = await page(phone);
    await push((await someone()).cookie, [archive]);
    expect(await rows('challenges', you)).toMatchObject([{ retired_at: null }]);

    expect(await push(phone, [archive])).toEqual({ results: [{ ok: true }] });
    expect((await page(phone, first.cursor)).rows).toMatchObject([
      { entity: 'challenge', row: { id: 'archived', retiredAt: 1234 } },
    ]);
    await push(phone, [
      { ...archive, payload: { retiredAt: 5678 } },
      create('archived', 'a-v1'),
      edit('archived', 'a-v2', 2),
      // Another phone's offline workout remains part of history, even when it arrives after archive.
      done('a-workout', 'a-run', ['a-set']),
    ]);
    expect(await rows('challenges', you)).toMatchObject([
      { retired_at: 1234, current_version_id: 'a-v1' },
    ]);
    const restored = await page(phone);
    expect(restored.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: 'challenge',
          row: expect.objectContaining({ retiredAt: 1234 }),
        }),
        expect.objectContaining({ entity: 'run', row: expect.objectContaining({ id: 'a-run' }) }),
        expect.objectContaining({
          entity: 'workout',
          row: expect.objectContaining({ id: 'a-workout' }),
        }),
      ]),
    );
    expect(await rows('sets', you)).toHaveLength(1);
  });

  it('keeps each change once, however often the phone sends it', async () => {
    const { cookie: phone, id: you } = await someone();
    const outbox = [
      create('c1', 'c1-v1'),
      join('r1', 'c1'),
      done('w1', 'r1', ['s1', 's2']),
      freeze('2026-11-09'),
    ];
    const allTaken = { results: outbox.map(() => ({ ok: true })) };
    expect(await push(phone, outbox)).toEqual(allTaken);
    // The answer was lost: the phone sends it all again.
    expect(await push(phone, outbox)).toEqual(allTaken);

    expect(await rows('workouts', you)).toHaveLength(1);
    expect(await rows('sets', you)).toEqual([
      expect.objectContaining({ id: 's1', plan_step: 0, reps: 10, workout_id: 'w1' }),
      expect.objectContaining({ id: 's2', plan_step: 2 }),
    ]);
    // A resent workout carrying another set for a step it already has gains nothing.
    expect(await push(phone, [done('w1', 'r1', ['s9'])])).toEqual({ results: [{ ok: true }] });
    expect(await rows('sets', you)).toHaveLength(2);
    expect(await rows('challenge_versions', you)).toHaveLength(1);
    expect(await rows('streak_events', you)).toHaveLength(1);
    // One entry per row for the other phones to pull; a workout's stands for its sets.
    const log = await rows('changes', you);
    expect(log).toHaveLength(5);
    expect(new Set(log.map((c) => c.entity))).toEqual(
      new Set(['challenge', 'challenge_version', 'run', 'streak_event', 'workout']),
    );
  });

  it("edits and leaving change only the account's own rows; the last edit taken wins", async () => {
    const { cookie: annPhone, id: annId } = await someone('Ann');
    const ofC2 = async (table: string) =>
      (await rows(table, annId)).filter(
        (r) => r.id === 'r2' || r.id === 'c2' || r.challenge_id === 'c2',
      );
    await push(annPhone, [create('c2', 'c2-v1'), join('r2', 'c2'), edit('c2', 'c2-v2', 2)]);
    // Another phone of Ann's edited offline too; its edit arrives later and wins. Both versions stay.
    await push(annPhone, [edit('c2', 'c2-v3', 2)]);

    // An edit naming another challenge's version, taken in the same request, doesn't take it.
    await push(annPhone, [create('c9', 'c9-v1'), edit('c2', 'c9-v1', 4)]);
    expect(await ofC2('challenges')).toEqual([
      expect.objectContaining({ current_version_id: 'c2-v3' }),
    ]);

    const { cookie: bobPhone } = await someone('Bob');
    expect(await push(bobPhone, [edit('c2', 'bob-v', 9), leave('r2')])).toEqual({
      results: [{ ok: true }, { ok: true }],
    });

    expect(await ofC2('challenges')).toEqual([
      expect.objectContaining({ current_version_id: 'c2-v3' }),
    ]);
    expect(new Set((await ofC2('challenge_versions')).map((v) => v.id))).toEqual(
      new Set(['c2-v1', 'c2-v2', 'c2-v3']),
    );
    expect(await ofC2('runs')).toEqual([expect.objectContaining({ ended_on: null })]);

    // The first phone's answer was lost: it sends its old edit again. The newer one stands.
    await push(annPhone, [edit('c2', 'c2-v2', 2)]);
    expect(await ofC2('challenges')).toEqual([
      expect.objectContaining({ current_version_id: 'c2-v3' }),
    ]);

    await push(annPhone, [leave('r2')]);
    // Another phone left the same run a day later: the first leave stands.
    await push(annPhone, [
      { ...leave('r2'), payload: { endedOn: '2026-11-12', endReason: 'left' } },
    ]);
    expect(await ofC2('runs')).toEqual([
      expect.objectContaining({ ended_on: '2026-11-11', end_reason: 'left' }),
    ]);
  });

  it("refuses a change it can't read and keeps the others", async () => {
    const { cookie: phone, id: you } = await someone();
    const broken = done('w-bad', null, ['s-bad']);
    const answer = await push(phone, [
      // No such day: the leagues count streaks from it.
      { ...broken, payload: { workout: { ...broken.payload.workout, day: '2026-02-30' } } },
      {
        ...create('c-null', 'c-null-v1'),
        payload: {
          ...create('c-null', 'c-null-v1').payload,
          version: { ...version('c-null', 'c-null-v1', 1), plan: null },
        },
      },
      done('w-odd', null, []),
      // The row it names isn't the one it holds.
      { ...done('w-odd', null, []), entityId: 'w-other' },
      freeze('2026-11-08'),
      { entity: 'workout', entityId: 'w', op: 'teleport', payload: {} },
    ]);
    expect(answer).toMatchObject({
      results: [
        { ok: false, reason: expect.stringContaining('day') },
        { ok: false, reason: expect.stringContaining('null') },
        { ok: true },
        { ok: false, reason: expect.stringContaining('entityId') },
        { ok: true },
        { ok: false },
      ],
    });
    expect((await rows('workouts', you)).map((w) => w.id)).not.toContain('w-bad');
    expect((await rows('streak_events', you)).map((e) => e.id)).toContain('used:2026-11-08');

    expect(
      await push(
        phone,
        Array.from({ length: 51 }, () => freeze('2026-11-07')),
      ),
    ).toBe(400);
  });

  it('takes 60 sends a minute from one account; another account still syncs', async () => {
    const { cookie: phone } = await someone();
    const send = async () => ((await push(phone, [])) === 429 ? 429 : 200);
    const passed = await passedBeforeLimit(send, 60);
    expect(passed).toBeGreaterThanOrEqual(60);
    expect(passed).toBeLessThanOrEqual(120);
    expect(await push((await someone()).cookie, [])).toEqual({ results: [] });
    // Up to 120 real requests: well past the default 5 s on a slow run.
  }, 20_000);

  it('another phone of the account pulls its rows in pages, as the phone keeps them', async () => {
    const { cookie: phone, id: you } = await someone();
    await push(phone, [
      create('c4', 'c4-v1'),
      join('r4', 'c4'),
      done('w4', 'r4', ['s4', 's5']),
      freeze('2026-11-03'),
    ]);

    const first = await page(phone);
    expect(first.more).toBe(false);
    expect(first.rows.map((r) => r.entity)).toEqual([
      'challenge_version',
      'challenge',
      'run',
      'workout',
      'streak_event',
    ]);
    const [, challenge, , workout] = first.rows;
    expect(challenge?.row).toEqual({
      id: 'c4',
      owner: you,
      visibility: 'private',
      currentVersionId: 'c4-v1',
      retiredAt: null,
    });
    expect(workout?.row).toMatchObject({
      id: 'w4',
      runId: 'r4',
      status: 'done',
      day: '2026-11-11',
    });
    expect(workout?.row.sets).toEqual([
      expect.objectContaining({ id: 's4', planStep: 0, attempts: set('w4', 's4', 0).attempts }),
      expect.objectContaining({ id: 's5', planStep: 2 }),
    ]);
    expect(Object.keys(workout?.row ?? {})).not.toContain('userId');

    // An edit and a leave elsewhere: the next pull brings only what changed, the challenge and run again.
    await push(phone, [edit('c4', 'c4-v2', 2), leave('r4')]);
    const next = await page(phone, first.cursor);
    expect(next.rows.map((r) => [r.entity, r.row.id])).toEqual([
      ['challenge_version', 'c4-v2'],
      ['challenge', 'c4'],
      ['run', 'r4'],
    ]);
    expect(next.rows[1]?.row.currentVersionId).toBe('c4-v2');
    expect(next.rows[2]?.row.endedOn).toBe('2026-11-11');
    expect((await page(phone, next.cursor)).rows).toEqual([]);

    // A long history comes in pages, each resuming where the last stopped.
    const days = Array.from({ length: 60 }, (_, i) =>
      freeze(`2025-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}`),
    );
    await push(phone, days.slice(0, 50));
    await push(phone, days.slice(50));
    const one = await page(phone, next.cursor);
    const two = await page(phone, one.cursor);
    expect([one.rows.length, one.more, two.rows.length, two.more]).toEqual([50, true, 10, false]);

    // Nobody else's rows, and a cursor that isn't one is refused.
    const others = await page((await someone()).cookie);
    expect(others.rows.map((r) => r.row.id)).not.toContain('c4');
    expect(await pull(phone, 'yesterday')).toBe(400);
  });
});
