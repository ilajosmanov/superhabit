import { createActor, toPromise, waitFor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { authClient } from './auth-client';
import { checkSession, signOut } from './session';
import { signIn } from './sign-in';
import { keepAccount, keepSignIn, markSignedOut } from './store';
import { account } from '@/storage/account';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { db as database } from '@/storage/database';
import { enqueue } from '@/storage/outbox';
import { outbox } from '@/storage/schema';

// The network is faked, and so is Better Auth's Expo plugin (it imports React Native, which Node can't
// load): a stand-in for its cookie handling, which sends the kept cookie and, like the real one, writes the
// cookie an answer sets before the call returns. The client, the machines and SQLite are real.
const fake = vi.hoisted(() => {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  // Before the client is made: it keeps the fetch it finds then.
  vi.stubGlobal('fetch', fetch);
  return { fetch, cookies: new Map<string, string>() };
});
vi.mock('@better-auth/expo/client', () => {
  const header = () => [...fake.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  return {
    expoClient: () => ({
      id: 'expo',
      getActions: () => ({ getCookie: async () => header() }),
      fetchPlugins: [
        {
          id: 'expo',
          name: 'Expo',
          init: async (url: string, options?: { headers?: object }) => ({
            url,
            options: { ...options, headers: { ...options?.headers, cookie: header() } },
          }),
          hooks: {
            onSuccess: async ({ response }: { response: Response }) => {
              const set = response.headers.get('set-cookie');
              if (!set) return;
              // The secure store writes asynchronously.
              await Promise.resolve();
              const [name = '', value = ''] = set.split(';')[0].split('=');
              if (/max-age=0/i.test(set)) fake.cookies.delete(name);
              else fake.cookies.set(name, value);
            },
          },
        },
      ],
    }),
  };
});
vi.mock('expo-secure-store', () => ({}));
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, Directory: class {} }));
vi.mock('expo-network', () => ({}));
vi.mock('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: {
    configure: () => {},
    signIn: async () => ({ type: 'success', data: { idToken: 'google-id-token' } }),
  },
  isNoSavedCredentialFoundResponse: () => false,
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
}));

const ann = { id: 'ann', name: 'Ann Lee', image: null };
const check = () => toPromise(createActor(checkSession).start());

/** The server's answer: JSON, with the cookie it sets. */
const json = (body: unknown, status = 200, cookie?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(cookie && { 'set-cookie': cookie }) },
  });
const session = (user: { id: string; name: string; image: string | null }) => ({
  user,
  session: { id: 's', userId: user.id, expiresAt: '2027-11-11T00:00:00Z' },
});
/** The next request waits for `answer`; aborting it rejects it, as React Native's fetch does. */
function later() {
  let answer: ((response: Response) => void) | undefined;
  fake.fetch.mockImplementationOnce(
    (_url, init) =>
      new Promise((resolve, reject) => {
        answer = resolve;
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
  );
  // Once the request is out.
  return async (response: Response) => {
    await vi.waitFor(() => expect(answer).toBeDefined());
    answer?.(response);
  };
}
/** What the server sets for a session that expired (Better Auth answers 200 and null). */
const EXPIRED = 'better-auth.session_token=; Max-Age=0; Path=/';
const signedInAgain = () =>
  json(
    { redirect: false, token: 'new', user: ann },
    200,
    'better-auth.session_token=new; Max-Age=31536000; Path=/',
  );
/** You sign in again on the sign-in screen, the server taking Google's token. */
async function signInAgain() {
  const actor = createActor(signIn).start();
  actor.send({ type: 'press' });
  await waitFor(actor, (s) => s.status === 'done', { timeout: 1_000 });
}

describe('the session check at launch', () => {
  beforeEach(async () => {
    await migrateDatabase();
    keepAccount(ann);
    fake.fetch.mockReset();
    fake.cookies.clear();
    fake.cookies.set('better-auth.session_token', 'old');
  });

  it('changes nothing offline: the client throws when the server is out of reach', async () => {
    fake.fetch.mockRejectedValue(new TypeError('Network request failed'));
    expect(await check()).toBe('unknown');
    expect(account()).toMatchObject({ id: 'ann', signedOut: false });
  });

  it('marks you signed out, data kept, only when the server says the session is gone', async () => {
    fake.fetch.mockResolvedValueOnce(json({ message: 'down' }, 500));
    expect(await check()).toBe('unknown');
    expect(account()?.signedOut).toBe(false);

    fake.fetch.mockResolvedValueOnce(json(null, 200, EXPIRED));
    expect(await check()).toBe('gone');
    expect(account()).toMatchObject({ id: 'ann', signedOut: true });
  });

  it('never takes in another account: that would clear the database under open screens', async () => {
    fake.fetch.mockResolvedValueOnce(json(session({ id: 'bob', name: 'Bob Day', image: null })));
    expect(await check()).toBe('unknown');
    expect(account()).toMatchObject({ id: 'ann', name: 'Ann Lee' });
  });

  it("an answer for an account that signed out meanwhile doesn't touch the one signed in now", async () => {
    const answer = later();
    const checking = check();
    keepAccount({ id: 'bob', name: 'Bob Day', image: null });
    await answer(json(null));
    expect(await checking).toBe('unknown');
    expect(account()).toMatchObject({ id: 'bob', signedOut: false });
  });

  it('an answer from before the same account signed in again leaves the new session alone', async () => {
    const answer = later();
    const checking = check();
    // League found the session gone; you signed in again as yourself.
    markSignedOut();
    keepSignIn(ann);
    await answer(json(null));
    expect(await checking).toBe('unknown');
    expect(account()).toMatchObject({ id: 'ann', signedOut: false });
  });

  it("a check stopped before its answer came can't sign out, or touch the cookie of the sign-in after it", async () => {
    const answer = later();
    const actor = createActor(checkSession).start();
    await vi.waitFor(() => expect(fake.fetch).toHaveBeenCalledTimes(1));
    // League found the session gone: startup leaves `ready`, which stops the check, and you sign in.
    actor.stop();
    fake.fetch.mockResolvedValueOnce(signedInAgain());
    await signInAgain();

    await answer(json(null, 200, EXPIRED));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await authClient.getCookie()).toBe('better-auth.session_token=new');
    expect(account()).toMatchObject({ id: 'ann', signedOut: false });
  });

  it('a sign-in waits for a stopped check whose answer was already coming in to write it first', async () => {
    // The answer has arrived but its body is still being read when the check stops: too late to abort.
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => void (body = controller),
    });
    fake.fetch.mockResolvedValueOnce(
      new Response(stream, {
        headers: { 'content-type': 'application/json', 'set-cookie': EXPIRED },
      }),
    );
    const actor = createActor(checkSession).start();
    await vi.waitFor(() => expect(fake.fetch).toHaveBeenCalledTimes(1));
    actor.stop();
    fake.fetch.mockResolvedValueOnce(signedInAgain());
    const signingIn = signInAgain();
    await new Promise((resolve) => setTimeout(resolve, 20));
    body?.enqueue(new TextEncoder().encode('null'));
    body?.close();
    await signingIn;
    // The old answer has finished writing by now, whichever went first.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await authClient.getCookie()).toBe('better-auth.session_token=new');
  });

  it('brings your name and photo up to date', async () => {
    fake.fetch.mockResolvedValueOnce(
      json(session({ id: 'ann', name: 'Ann Lee-Smith', image: 'https://photo/ann' })),
    );
    expect(await check()).toBe('ok');
    expect(account()).toMatchObject({ name: 'Ann Lee-Smith', image: 'https://photo/ann' });
  });

  it('signing out clears the phone, unless something is still unsent: then it waits for your next sign-in', async () => {
    database().transaction((tx) =>
      enqueue(tx, { entity: 'workout', entityId: 'w1', op: 'done', data: {} }),
    );
    await toPromise(createActor(signOut).start());
    // Your own sign-out: the next sign-in screen doesn't say the session ended.
    expect(account()).toMatchObject({ id: 'ann', signedOut: true, byYou: true });
    expect(db().select().from(outbox).all()).toHaveLength(1);

    db().delete(outbox).run();
    await toPromise(createActor(signOut).start());
    expect(account()).toBeNull();
  });
});
