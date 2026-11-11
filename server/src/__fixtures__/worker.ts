import { readdirSync, readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { afterAll, vi } from 'vite-plus/test';

import worker from '../index';

// Each test file that imports this gets its own Worker against a real local D1 (wrangler's own, in memory), migrated from the committed files. Google's
// ID tokens are signed here with a test key, served where Google serves its keys; nothing leaves the machine.
const server = new URL('../..', import.meta.url).pathname;
const proxy = await getPlatformProxy<Env>({
  configPath: `${server}wrangler.jsonc`,
  envFiles: [],
  persist: false,
  remoteBindings: false,
});
export const env = {
  ...proxy.env,
  BETTER_AUTH_SECRET: 'a test secret, long enough for Better Auth',
  GOOGLE_CLIENT_SECRET: '-',
};

for (const folder of readdirSync(`${server}migrations`).sort()) {
  const file = readFileSync(`${server}migrations/${folder}/migration.sql`, 'utf8');
  const statements = file.split('--> statement-breakpoint').filter((s) => s.trim());
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
}
afterAll(() => proxy.dispose());

const keys = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);
if (!('privateKey' in keys)) throw new Error('expected a key pair');
const { privateKey, publicKey } = keys;
const jwk = await crypto.subtle.exportKey('jwk', publicKey);
if (jwk instanceof ArrayBuffer) throw new Error('expected a JWK');
const { n, e } = jwk;
const certs = { keys: [{ kty: 'RSA', n, e, kid: 'test', alg: 'RS256', use: 'sig' }] };
const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
// Anything else the Worker fetched would reach the network: it fails the test instead.
vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
  if (urlOf(input) === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json(certs);
  throw new Error(`unexpected fetch: ${urlOf(input)}`);
});

type Person = { sub: string; email: string; name: string };
export const ann: Person = { sub: 'google-ann', email: 'ann@example.com', name: 'Ann Lee' };
export const bob: Person = { sub: 'google-bob', email: 'bob@example.com', name: 'Bob Day' };
export const carl: Person = { sub: 'google-carl', email: 'carl@example.com', name: 'Carl Ito' };
export const dee: Person = { sub: 'google-dee', email: 'dee@example.com', name: 'Dee Roy' };

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const json64 = (value: object) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** What Google's sign-in hands the phone: an ID token for our Web client unless `aud` names another. */
export async function googleToken(who: Person, aud: string = env.GOOGLE_CLIENT_ID) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...who,
    iss: 'https://accounts.google.com',
    aud,
    iat: now,
    exp: now + 3600,
    email_verified: true,
    picture: `https://lh3.googleusercontent.com/${who.sub}`,
  };
  const body = `${json64({ alg: 'RS256', kid: 'test', typ: 'JWT' })}.${json64(claims)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(body),
  );
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

// No `cf-connecting-ip`: every sign-in of a test file counts toward one limit of 30 a minute.
/** A request to the Worker; `bindings` stands in for a binding that fails or waits. */
export const call = (path: string, init: RequestInit = {}, bindings: typeof env = env) =>
  worker.fetch(new Request(`${env.BETTER_AUTH_URL}${path}`, init), bindings, proxy.ctx);

/** Signs in as the phone does; the session cookie, or null when refused. */
export async function trySignIn(token: string) {
  const response = await call('/api/auth/sign-in/social', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'expo-origin': 'superhabit://' },
    body: JSON.stringify({ provider: 'google', idToken: { token } }),
  });
  if (!response.ok) return null;
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

export async function signIn(who: Person) {
  const cookie = await trySignIn(await googleToken(who));
  if (!cookie) throw new Error(`${who.name} was refused`);
  return cookie;
}

type Me = { id: string; name: string; image: string; consents: object[] };

/** `GET /me`: you, or the status when refused. */
export async function me(cookie: string): Promise<Me | number> {
  const response = await call('/me', { headers: { cookie } });
  return response.ok ? response.json<Me>() : response.status;
}

export async function idOf(cookie: string) {
  const you = await me(cookie);
  if (typeof you === 'number') throw new Error(`/me answered ${you}`);
  return you.id;
}

export const consent = (cookie: string, body: object) =>
  call('/consent', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** The hourly Cron's run at today's midnight (UTC), the one that also sweeps traces and purges accounts. */
export const midnightCron = () =>
  worker.scheduled(
    {
      cron: '0 * * * *',
      scheduledTime: Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`),
      noRetry() {},
    },
    env,
  );
