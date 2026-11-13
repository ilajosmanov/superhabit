/** @jsxImportSource hono/jsx */

/**
 * The web page for deleting an account without the app (Google Play asks for one; canvas board 24),
 * rendered on the server: signed out, it offers Google; signed in, Delete; then it says it's done. Plain
 * forms, no script: the page's policy allows nothing but its own style.
 */
export const DELETE_PAGE_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "form-action 'self' https://accounts.google.com",
  // A delete button must never sit under someone else's page.
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export type DeletePageState =
  | { step: 'signedOut'; problem?: string }
  | { step: 'signedIn'; name: string; account: string; problem?: string }
  | { step: 'deleted' };

const TEXT = {
  signedOut:
    'Sign in with the Google account you use in RepRepGo, then delete it here. No app needed.',
  signedIn:
    "This deletes your RepRepGo account and everything we hold about you. It can't be undone.",
  deleted: 'Thanks for training with us. Signing in again starts a new account.',
};

export function DeletePage({ state }: { state: DeletePageState }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Delete your RepRepGo account</title>
        <style>{STYLE}</style>
      </head>
      <body>
        <main>
          <span class="mono">REPREPGO</span>
          <h1>{state.step === 'deleted' ? 'Your account is deleted' : 'Delete your account'}</h1>
          <p>{TEXT[state.step]}</p>
          {state.step !== 'deleted' && state.problem && (
            <p class="problem" role="alert">
              {state.problem}
            </p>
          )}
          {state.step === 'signedOut' && (
            <form method="post" action="/delete/google">
              <button class="google" type="submit">
                <GoogleMark /> Sign in with Google
              </button>
            </form>
          )}
          {state.step === 'signedIn' && (
            <>
              <p class="who">
                Signed in as <strong>{state.name}</strong>
              </p>
              <form method="post" action="/delete">
                <input type="hidden" name="account" value={state.account} />
                <button class="delete" type="submit">
                  Delete my account
                </button>
              </form>
              <form method="post" action="/delete/sign-out">
                <button class="other" type="submit">
                  Not me, sign out
                </button>
              </form>
            </>
          )}
          <ul>
            <li>Your sign-in goes at once, and every phone is signed out.</li>
            <li>Everything else we hold about you is deleted within 30 days.</li>
            <li>Workouts and videos on your phone stay there until you delete the app.</li>
          </ul>
        </main>
      </body>
    </html>
  );
}

/** Google's "G", as its sign-in branding asks. */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

const STYLE = `
:root{color-scheme:dark}
body{margin:0;background:#0d0e0b;color:#f2f0e8;font:17px/1.45 system-ui,sans-serif}
main{max-width:440px;margin:0 auto;padding:48px 24px;display:flex;flex-direction:column;gap:24px}
form{display:flex;flex-direction:column}
.mono{font:12px ui-monospace,monospace;letter-spacing:.1em;color:#a3a396}
h1{margin:0;font-size:40px;font-weight:200;line-height:1.05;letter-spacing:-.04em}
p{margin:0;color:#c9c8bc}
button{font:inherit;cursor:pointer;height:56px;border-radius:9999px;display:flex;align-items:center;justify-content:center;gap:12px}
.google{border:1px solid #8e918f;background:#131314;color:#e3e3e3;font-weight:500;font-size:16px}
.delete{border:0;background:#ff6a55;color:#0d0e0b;font-weight:600}
.other{height:48px;border:0;background:none;color:#a3a396;text-decoration:underline;font-size:15px}
.who{font-size:15px;color:#a3a396}.who strong{color:#f2f0e8;font-weight:500}
.problem{color:#ff6a55}
ul{margin:8px 0 0;padding:16px 0 0 20px;border-top:1px solid #2e3028;display:flex;flex-direction:column;gap:8px;font-size:14px;color:#a3a396}
`;
