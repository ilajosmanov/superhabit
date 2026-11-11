import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import { createAuth } from '../auth/auth';
import { signedIn } from '../auth/signed-in';
import { open } from '../db/db';
import type { Route, SignedInRoute } from '../env';
import { DELETE_PAGE_POLICY, DeletePage, type DeletePageState } from './delete-page';
import { deleteAccount, me } from './store';

/** The web page's forms post only from the page itself: another site's form must not drive them. */
const sameOrigin = createMiddleware<Route>(async (c, next) => {
  if (c.req.header('origin') !== new URL(c.env.BETTER_AUTH_URL).origin) {
    return c.text('Forbidden', 403);
  }
  await next();
});

const page = (c: Context<Route>, state: DeletePageState) => {
  c.header('content-security-policy', DELETE_PAGE_POLICY);
  return c.html(DeletePage({ state }));
};

/** Better Auth's cookies (sign-in state, the session, its end) go back to the browser. */
const passCookies = (c: Context<Route>, headers: Headers) => {
  for (const cookie of headers.getSetCookie()) c.header('set-cookie', cookie, { append: true });
};

const browserSession = (c: Context<Route>) =>
  createAuth(c.env, open(c.env)).api.getSession({
    headers: c.req.raw.headers,
    query: { disableRefresh: true },
  });

export const accountRoutes = new Hono<SignedInRoute>()
  /** Who you are, as Google gave it, and the consents in force. */
  .get('/me', signedIn, async (c) => c.json(await me(c.var.db, c.var.userId)))
  .delete('/account', signedIn, async (c) => {
    await deleteAccount(c.var.db, c.var.userId);
    return c.body(null, 204);
  });

/** Deleting without the app, in a browser (`delete-page.tsx`): Google's redirect sign-in, then Delete. */
export const deletePageRoutes = new Hono<Route>()
  .get('/delete', async (c) => {
    const session = await browserSession(c);
    const problem = c.req.query('error') ? "Google didn't sign you in. Try again." : undefined;
    return page(
      c,
      session
        ? { step: 'signedIn', name: session.user.name || session.user.email, problem }
        : { step: 'signedOut', problem },
    );
  })
  .post('/delete/google', sameOrigin, async (c) => {
    const { headers, response } = await createAuth(c.env, open(c.env)).api.signInSocial({
      body: {
        provider: 'google',
        callbackURL: '/delete',
        errorCallbackURL: '/delete?error=google',
      },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    if (!response.url) return page(c, { step: 'signedOut', problem: "Couldn't reach Google." });
    passCookies(c, headers);
    return c.redirect(response.url, 303);
  })
  .post('/delete', sameOrigin, async (c) => {
    const session = await browserSession(c);
    if (!session) return c.redirect('/delete', 303);
    const db = open(c.env);
    await deleteAccount(db, session.user.id);
    // The session went with the account; this clears its cookie.
    const { headers } = await createAuth(c.env, db).api.signOut({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    passCookies(c, headers);
    return page(c, { step: 'deleted' });
  })
  .post('/delete/sign-out', sameOrigin, async (c) => {
    const { headers } = await createAuth(c.env, open(c.env)).api.signOut({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    passCookies(c, headers);
    return c.redirect('/delete', 303);
  });
