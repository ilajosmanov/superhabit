import { describe, expect, it } from 'vite-plus/test';

import { bob, consent, dee, env, idOf, me, signIn } from '../__fixtures__/worker';

describe('consents', () => {
  it('keeps one consent in force per kind: given, given again, replaced by a new policy, withdrawn', async () => {
    const cookie = await signIn(bob);
    const inForce = async () => {
      const you = await me(cookie);
      return typeof you === 'number' ? you : you.consents;
    };
    const traces = (policyVersion: string, granted: boolean) =>
      consent(cookie, { kind: 'traces', policyVersion, granted });

    expect((await traces('1', true)).status).toBe(204);
    await traces('1', true);
    expect(await inForce()).toEqual([
      { kind: 'traces', policyVersion: '1', grantedAt: expect.any(Number) },
    ]);
    await traces('2', true);
    expect(await inForce()).toEqual([
      { kind: 'traces', policyVersion: '2', grantedAt: expect.any(Number) },
    ]);
    await traces('2', false);
    expect(await inForce()).toEqual([]);
    // The proof stays: both grants, the first stamped when replaced, the second when withdrawn.
    const rows = await env.DB.prepare('select withdrawn_at from consents where user_id = ?')
      .bind(await idOf(cookie))
      .all();
    expect(rows.results.map((r) => r.withdrawn_at)).toEqual([
      expect.any(Number),
      expect.any(Number),
    ]);
    const unknown = { kind: 'faces', policyVersion: '1', granted: true };
    expect((await consent(cookie, unknown)).status).toBe(400);
  });

  it('takes a double tap of Agree as one grant', async () => {
    const cookie = await signIn(dee);
    const agree = () => consent(cookie, { kind: 'traces', policyVersion: '1', granted: true });
    const answers = await Promise.all([agree(), agree()]);
    expect(answers.map((r) => r.status)).toEqual([204, 204]);
    const rows = await env.DB.prepare('select id from consents where user_id = ?')
      .bind(await idOf(cookie))
      .all();
    expect(rows.results).toHaveLength(1);
  });
});
