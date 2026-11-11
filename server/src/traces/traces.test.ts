import { describe, expect, it } from 'vite-plus/test';

import worker from '../index';
import { open } from '../db/db';
import { dropTraces } from './store';
import { done, push } from '../__fixtures__/outbox';
import { ann, bob, call, consent, env, idOf, signIn } from '../__fixtures__/worker';
import { encodeTrace, type TraceInfo } from '../../../src/storage/trace-file';

// Real `.sht` files, from the phone's own encoder.
const trace = (setId: string, consents = ['traces@1']) => {
  const info: TraceInfo = {
    exercise: 'squat',
    setId,
    counterVersion: '1.0.0',
    device: { model: 'Pixel 9', os: 'Android 17' },
    camera: null,
    takes: [],
    consent: consents,
    counted: { reps: 1 },
    labels: {},
  };
  return encodeTrace(info, [
    {
      t: 0,
      landmarks: Array.from({ length: 33 }, (_, j) => [0.3 + j / 100, 0.5, 0, 0.9] as const),
      world: Array.from({ length: 33 }, (_, j) => [j / 100, 0, 0, 0.9] as const),
      down: [0, 1, 0],
      phase: null,
      waiting: null,
      inferenceMs: null,
      brightness: null,
    },
  ]);
};
const upload = (cookie: string, setId: string, file: Uint8Array, bindings = env) =>
  call(`/traces/${setId}`, { method: 'PUT', headers: { cookie }, body: file }, bindings);
const share = (cookie: string, granted: boolean) =>
  consent(cookie, { kind: 'traces', policyVersion: '1', granted });
const stored = async (userId: string) =>
  (await env.TRACES.list({ prefix: `traces/${userId}/` })).objects.map((o) => o.key);
const rows = async (userId: string) =>
  (await env.DB.prepare('select set_id from traces where user_id = ?').bind(userId).all()).results;
const cron = () =>
  worker.scheduled({ cron: '0 4 * * *', scheduledTime: Date.now(), noRetry() {} }, env);

describe('traces: the phone shares a set', () => {
  it('keeps a shared set once, and refuses what sharing never covered', async () => {
    const phone = await signIn(ann);
    const you = await idOf(phone);
    await push(phone, [done('w1', null, ['s1', 's2'])]);

    // Not before sharing is on, even for a file recorded while it was.
    expect((await upload(phone, 's1', trace('s1'))).status).toBe(403);
    await share(phone, true);
    expect((await upload(phone, 's1', trace('s1'))).status).toBe(204);
    expect((await upload(phone, 's1', trace('s1'))).status).toBe(204);
    expect(await stored(you)).toEqual([`traces/${you}/s1.sht`]);
    expect(await rows(you)).toEqual([{ set_id: 's1' }]);

    // Recorded before you said yes; another set's file; a damaged file; a set not synced yet.
    expect((await upload(phone, 's2', trace('s2', []))).status).toBe(422);
    expect((await upload(phone, 's2', trace('s1'))).status).toBe(422);
    const damaged = trace('s2');
    damaged[damaged.length - 6] ^= 0xff;
    expect((await upload(phone, 's2', damaged)).status).toBe(422);
    expect((await upload(phone, 's3', trace('s3'))).status).toBe(409);

    // Bob can't put a file on Ann's set.
    const bobs = await signIn(bob);
    await share(bobs, true);
    expect((await upload(bobs, 's2', trace('s2'))).status).toBe(409);
    expect(await stored(you)).toEqual([`traces/${you}/s1.sht`]);
  });

  it('keeps nothing when sharing stops while a file goes up, even if it is given again', async () => {
    const phone = await signIn(ann);
    const you = await idOf(phone);
    await share(phone, true);
    await push(phone, [done('w4', null, ['s7'])]);
    for (const again of [false, true]) {
      // R2 is slow: the file lands only when the test says.
      let land = () => {};
      let started = () => {};
      const putting = new Promise<void>((resolve) => (started = resolve));
      const slow = {
        ...env,
        TRACES: {
          ...env.TRACES,
          delete: env.TRACES.delete.bind(env.TRACES),
          put: async (...args: Parameters<R2Bucket['put']>) => {
            started();
            await new Promise<void>((resolve) => (land = resolve));
            return env.TRACES.put(...args);
          },
        },
      };
      const going = upload(phone, 's7', trace('s7'), slow);
      await putting;
      await share(phone, false);
      if (again) await share(phone, true);
      land();
      expect((await going).status).toBe(403);
      expect(await stored(you)).toEqual([]);
      expect(await rows(you)).toEqual([]);
      if (!again) await share(phone, true);
    }
  });

  it('a file that lands after a deletion read its row still has a row to find it by', async () => {
    // The daily sweep chose this account before it shared again, and reaches it mid-upload.
    const phone = await signIn(ann);
    const you = await idOf(phone);
    await share(phone, true);
    await push(phone, [done('w7', null, ['s10'])]);
    let land = () => {};
    let started = () => {};
    const putting = new Promise<void>((resolve) => (started = resolve));
    const slow = {
      ...env,
      TRACES: {
        ...env.TRACES,
        delete: env.TRACES.delete.bind(env.TRACES),
        put: async (...args: Parameters<R2Bucket['put']>) => {
          started();
          await new Promise<void>((resolve) => (land = resolve));
          return env.TRACES.put(...args);
        },
      },
    };
    const going = upload(phone, 's10', trace('s10'), slow);
    await putting;
    // The deletion removes the key before the file lands, and its row after the upload is done.
    let deleted = () => {};
    const keyGone = new Promise<void>((resolve) => (deleted = resolve));
    let uploaded = () => {};
    const finished = new Promise<void>((resolve) => (uploaded = resolve));
    const dropping = dropTraces(
      open(env),
      {
        ...env.TRACES,
        delete: async (keys: string | string[]) => {
          await env.TRACES.delete(keys);
          deleted();
          await finished;
        },
      },
      you,
    );
    await keyGone;
    land();
    expect((await going).status).toBe(204);
    uploaded();
    await dropping;
    expect(await stored(you)).toEqual([`traces/${you}/s10.sht`]);
    expect(await rows(you)).toEqual([{ set_id: 's10' }]);
    await share(phone, false);
    expect(await stored(you)).toEqual([]);
  });

  it('a file that lands after its account was deleted goes with it', async () => {
    const phone = await signIn(bob);
    const you = await idOf(phone);
    await share(phone, true);
    await push(phone, [done('w6', null, ['s9'])]);
    let land = () => {};
    let started = () => {};
    const putting = new Promise<void>((resolve) => (started = resolve));
    const slow = {
      ...env,
      TRACES: {
        ...env.TRACES,
        delete: env.TRACES.delete.bind(env.TRACES),
        put: async (...args: Parameters<R2Bucket['put']>) => {
          started();
          await new Promise<void>((resolve) => (land = resolve));
          return env.TRACES.put(...args);
        },
      },
    };
    const going = upload(phone, 's9', trace('s9'), slow);
    await putting;
    await call('/account', { method: 'DELETE', headers: { cookie: phone } });
    land();
    expect((await going).status).toBe(403);
    await cron();
    expect(await stored(you)).toEqual([]);
    expect(await rows(you)).toEqual([]);
  });

  it('finishes a deletion that failed: the daily sweep, or before sharing is given again', async () => {
    const phone = await signIn(ann);
    const you = await idOf(phone);
    await share(phone, true);
    await push(phone, [done('w5', null, ['s8'])]);
    await upload(phone, 's8', trace('s8'));
    const failing = {
      ...env,
      TRACES: {
        ...env.TRACES,
        delete: async () => {
          throw new Error('R2 is down');
        },
      },
    };
    const withdraw = { kind: 'traces', policyVersion: '1', granted: false };
    const body = { method: 'PUT', headers: { cookie: phone, 'content-type': 'application/json' } };
    const withdrawFailing = () =>
      call('/consent', { ...body, body: JSON.stringify(withdraw) }, failing);
    expect((await withdrawFailing()).status).toBe(500);
    expect(await stored(you)).toHaveLength(1);
    await cron();
    expect(await stored(you)).toEqual([]);

    await share(phone, true);
    await upload(phone, 's8', trace('s8'));
    expect((await withdrawFailing()).status).toBe(500);
    await share(phone, true);
    expect(await stored(you)).toEqual([]);
    expect(await rows(you)).toEqual([]);
  });

  it('deletes what was shared when sharing stops, and when the account is deleted', async () => {
    const phone = await signIn(ann);
    const you = await idOf(phone);
    await share(phone, true);
    await push(phone, [done('w2', null, ['s4', 's5'])]);
    await upload(phone, 's4', trace('s4'));
    const bobs = await signIn(bob);
    const bob1 = await idOf(bobs);
    await share(bobs, true);
    await push(bobs, [done('w3', null, ['s6'])]);
    await upload(bobs, 's6', trace('s6'));

    await share(phone, false);
    expect(await stored(you)).toEqual([]);
    expect(await rows(you)).toEqual([]);
    expect((await upload(phone, 's5', trace('s5'))).status).toBe(403);

    // A deleted account's traces go with the next daily run; Bob's stay.
    await call('/account', { method: 'DELETE', headers: { cookie: bobs } });
    expect(await stored(bob1)).toHaveLength(1);
    await cron();
    expect(await stored(bob1)).toEqual([]);
    expect(await rows(bob1)).toEqual([]);
  });
});
