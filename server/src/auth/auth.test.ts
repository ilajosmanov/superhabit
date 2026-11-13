import { describe, expect, it } from 'vite-plus/test';

import {
  ann,
  bob,
  call,
  consent,
  dee,
  env,
  googleToken,
  idOf,
  ipOf,
  me,
  passedBeforeLimit,
  signIn,
  someone,
  trySignIn,
} from '../__fixtures__/worker';

describe('sign-in', () => {
  it('signs you in with a Google ID token and knows you again on the next sign-in', async () => {
    const first = await signIn(ann);
    expect(await me(first)).toMatchObject({
      name: 'Ann Lee',
      image: 'https://lh3.googleusercontent.com/google-ann',
      consents: [],
    });
    expect(await idOf(await signIn(ann))).toBe(await idOf(first));
  });

  it('refuses a token made for another app, and every route without a session', async () => {
    const elsewhere = await googleToken(ann, 'another-app.apps.googleusercontent.com');
    expect(await trySignIn(elsewhere, ipOf(ann))).toBeNull();
    expect(await me('')).toBe(401);
    const change = { kind: 'traces', policyVersion: '1', granted: true };
    expect((await consent('', change)).status).toBe(401);
  });

  it('lets the app sign out, and refuses the same request from a web page', async () => {
    const cookie = await signIn(dee);
    const signOut = (origin: Record<string, string>) =>
      call('/api/auth/sign-out', { method: 'POST', headers: { cookie, ...origin } });
    expect((await signOut({ origin: 'https://evil.example' })).status).toBe(403);
    expect(await me(cookie)).toMatchObject({ name: 'Dee Roy' });
    expect((await signOut({ 'expo-origin': 'superhabit://' })).status).toBe(200);
    expect(await me(cookie)).toBe(401);
  });

  it("keeps Better Auth's other endpoints closed: a member can't rename themselves for the board", async () => {
    const cookie = await signIn(ann);
    const post = (path: string, body: object) =>
      call(`/api/auth/${path}`, {
        method: 'POST',
        headers: { cookie, 'expo-origin': 'superhabit://', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect(
      (await post('update-user', { name: 'Admin', image: 'https://evil.example/a.png' })).status,
    ).toBe(404);
    expect((await post('delete-user', {})).status).toBe(404);
    expect(await me(cookie)).toMatchObject({ name: 'Ann Lee' });
  });

  it('takes 30 posts a minute from one IP; another IP still signs in', async () => {
    const post = () =>
      call('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '192.0.2.1' },
      });
    const passed = await passedBeforeLimit(async () => (await post()).status, 30);
    expect(passed).toBeGreaterThanOrEqual(30);
    expect(passed).toBeLessThanOrEqual(60);
    expect(await me(await signIn(bob))).toMatchObject({ name: 'Bob Day' });
  });

  it("refuses a change another site's page asks for, though the browser sends the cookie", async () => {
    const { cookie } = await someone();
    const share = (headers: Record<string, string>) =>
      call('/consent', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ kind: 'traces', policyVersion: '1', granted: true }),
      });
    expect((await share({ origin: 'https://evil.example' })).status).toBe(403);
    expect(await me(cookie)).toMatchObject({ consents: [] });
    // The app sends no Origin.
    expect((await share({})).status).toBe(204);
  });

  it('keeps a phone used every day signed in: the session check at launch renews it', async () => {
    const cookie = await signIn(dee);
    const userId = await idOf(cookie);
    const DAY = 24 * 60 * 60 * 1000;
    // A session signed in two days ago: due for renewal.
    await env.DB.prepare('update session set expires_at = ? where user_id = ?')
      .bind(Date.now() + 363 * DAY, userId)
      .run();
    const expiry = async () =>
      (
        await env.DB.prepare('select expires_at from session where user_id = ?')
          .bind(userId)
          .first()
      )?.expires_at;
    const before = await expiry();
    const fromMe = await call('/me', { headers: { cookie } });
    expect(fromMe.headers.getSetCookie()).toEqual([]);
    expect(await expiry()).toBe(before);
    const atLaunch = await call('/api/auth/get-session', {
      headers: { cookie, 'expo-origin': 'superhabit://' },
    });
    expect(atLaunch.headers.getSetCookie().join()).toMatch(/session_token=.*Max-Age=31536000/);
    expect(await expiry()).toBeGreaterThan(Date.now() + 364 * DAY);
  });
});
