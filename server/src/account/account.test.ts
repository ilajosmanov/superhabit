import { describe, expect, it } from 'vite-plus/test';

import worker from '../index';
import { ann, call, carl, consent, env, idOf, me, signIn } from '../__fixtures__/worker';

describe('account', () => {
  it('deletes an account: signed out everywhere, a new account on return, the rest purged by the Cron', async () => {
    const phone = await signIn(carl);
    const tablet = await signIn(carl);
    const deleted = await idOf(phone);
    await consent(phone, { kind: 'traces', policyVersion: '1', granted: true });
    const annPhone = await signIn(ann);
    await consent(annPhone, { kind: 'video', policyVersion: '1', granted: true });

    expect((await call('/account', { method: 'DELETE', headers: { cookie: phone } })).status).toBe(
      204,
    );
    expect(await me(phone)).toBe(401);
    expect(await me(tablet)).toBe(401);
    const back = await signIn(carl);
    expect(await me(back)).toMatchObject({ name: 'Carl Ito', consents: [] });
    expect(await idOf(back)).not.toBe(deleted);

    const left = () =>
      env.DB.prepare('select kind from consents where user_id = ?').bind(deleted).all();
    expect((await left()).results).toHaveLength(1);
    await worker.scheduled({ cron: '0 4 * * *', scheduledTime: Date.now(), noRetry() {} }, env);
    expect((await left()).results).toEqual([]);
    expect(await me(annPhone)).toMatchObject({
      consents: [{ kind: 'video', policyVersion: '1', grantedAt: expect.any(Number) }],
    });
  });
});
