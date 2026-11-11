import { describe, expect, it } from 'vite-plus/test';

import worker from '../index';
import { ann, call, carl, consent, dee, env, idOf, me, signIn } from '../__fixtures__/worker';

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

  it('deletes from a browser: Google asks which account, then Delete signs out and deletes', async () => {
    const page = await call('/delete');
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await page.text()).toContain('Sign in with Google');

    const fromHere = { origin: env.BETTER_AUTH_URL };
    expect((await call('/delete/google', { method: 'POST' })).status).toBe(403);
    const toGoogle = await call('/delete/google', { method: 'POST', headers: fromHere });
    expect(toGoogle.status).toBe(303);
    const google = new URL(toGoogle.headers.get('location') ?? '');
    expect(google.host).toBe('accounts.google.com');
    expect(google.searchParams.get('prompt')).toBe('select_account');
    expect(google.searchParams.get('redirect_uri')).toBe(
      `${env.BETTER_AUTH_URL}/api/auth/callback/google`,
    );
    // Google's answer is checked against the state cookie set here.
    expect(toGoogle.headers.getSetCookie().length).toBeGreaterThan(0);

    // Back from Google with a session (the phone's cookie stands in for the browser's).
    const browser = await signIn(dee);
    const signedInPage = await (await call('/delete', { headers: { cookie: browser } })).text();
    expect(signedInPage).toContain('Dee Roy');
    // The browser posts back the account the page showed.
    const deeId = /name="account" value="([^"]+)"/.exec(signedInPage)?.[1] ?? '';
    expect(deeId).toBe(await idOf(browser));
    const form = (account: string) => new URLSearchParams({ account });
    const elsewhere = { cookie: browser, origin: 'https://evil.example' };
    expect(
      (await call('/delete', { method: 'POST', headers: elsewhere, body: form(deeId) })).status,
    ).toBe(403);
    // A form shown for another account (a tab from before switching) deletes nothing.
    const stale = await call('/delete', {
      method: 'POST',
      headers: { ...fromHere, cookie: browser },
      body: form('ann-from-before'),
    });
    expect(await stale.text()).toContain('switched accounts');
    expect(await idOf(browser)).toBe(deeId);
    const done = await call('/delete', {
      method: 'POST',
      headers: { ...fromHere, cookie: browser },
      body: form(deeId),
    });
    expect(await done.text()).toContain('Your account is deleted');
    expect(await me(browser)).toBe(401);
  });
});
