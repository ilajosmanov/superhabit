import { readFileSync } from 'node:fs';
import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vite-plus/test';

import * as schema from '../db/schema';
import { create, done, freeze, join, push } from '../__fixtures__/outbox';
import { trace } from '../__fixtures__/trace';
import {
  ann,
  call,
  carl,
  consent,
  dee,
  env,
  midnightCron,
  idOf,
  me,
  signIn,
} from '../__fixtures__/worker';

// Every table holding an account's rows, read from the schema so a new one can't be missed. `deletions`
// is the record that the account was deleted, kept so the purge can finish.
const accountTables = Object.values(schema)
  .filter((table) => is(table, SQLiteTable))
  .map(getTableConfig)
  .filter(({ name, columns }) => name !== 'deletions' && columns.some((c) => c.name === 'user_id'))
  .map(({ name }) => name);
const rowsOf = async (userId: string) =>
  Object.fromEntries(
    await Promise.all(
      accountTables.map(async (table) => {
        const { results } = await env.DB.prepare(`select * from ${table} where user_id = ?`)
          .bind(userId)
          .all();
        return [table, results.length] as const;
      }),
    ),
  );

describe('account', () => {
  it('deletes an account: signed out everywhere, a new account on return, the rest purged by the Cron', async () => {
    const phone = await signIn(carl);
    const tablet = await signIn(carl);
    const deleted = await idOf(phone);
    // A row in every table: shared, synced, a trace, a leaderboard choice, and a board from the Cron.
    await consent(phone, { kind: 'traces', policyVersion: '1', granted: true });
    await push(phone, [
      create('c1', 'c1-v1'),
      join('r1', 'c1'),
      done('w1', 'r1', ['s1']),
      freeze('2026-11-10'),
    ]);
    await call('/traces/s1', { method: 'PUT', headers: { cookie: phone }, body: trace('s1') });
    await call('/leaderboard/visibility', {
      method: 'PUT',
      headers: { cookie: phone, 'content-type': 'application/json' },
      body: JSON.stringify({ visible: true }),
    });
    await midnightCron();
    for (const [table, n] of Object.entries(await rowsOf(deleted)))
      expect(n, table).toBeGreaterThan(0);
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

    expect((await rowsOf(deleted)).consents).toBe(1);
    await midnightCron();
    expect(await rowsOf(deleted)).toEqual(Object.fromEntries(accountTables.map((t) => [t, 0])));
    expect(await me(annPhone)).toMatchObject({
      consents: [{ kind: 'video', policyVersion: '1', grantedAt: expect.any(Number) }],
    });
  });

  it('shows the privacy policy the app asks consent for, and nothing can run on it', async () => {
    const app = readFileSync(new URL('../../../src/account/consent.ts', import.meta.url), 'utf8');
    const version = /POLICY_VERSION = '([^']+)'/.exec(app)?.[1];
    const page = await call('/privacy');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    // The page names the version for this check only; people read its date.
    expect(await page.text()).toContain(`<meta name="version" content="${version}"`);
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
