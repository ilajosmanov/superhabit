/** @jsxImportSource hono/jsx */

// OWNER: review this wording before release. It must say only what the code does; change it with the code.

/**
 * The privacy policy (`GET /privacy`; Google Play asks for its URL), rendered on the server like the delete
 * page: plain HTML, no script. The app records consent against this version (`POLICY_VERSION` in
 * src/account/consent.ts): a new version there needs one here.
 */
export const PRIVACY_POLICY_VERSION = '2026-11-11';

export const PRIVACY_PAGE_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

/** The version is its date; people read it as "11 November 2026". */
const LAST_UPDATED = new Date(`${PRIVACY_POLICY_VERSION}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function PrivacyPage() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="version" content={PRIVACY_POLICY_VERSION} />
        <title>Superhabit privacy policy</title>
        <style>{STYLE}</style>
      </head>
      <body>
        <main>
          <span class="mono">SUPERHABIT</span>
          <h1>Privacy policy</h1>
          <p class="version">Last updated {LAST_UPDATED}</p>
          <p>
            Superhabit counts your exercise reps using your phone’s camera. This policy explains
            what information we collect, why we collect it, and the choices you have. We do not sell
            your information and we do not use it for advertising.
          </p>

          <section>
            <h2>Information we collect</h2>
            <p>
              <strong>Your account.</strong> When you sign in with Google, we receive your name,
              email address, profile photo and a number that identifies your Google account.
            </p>
            <p>
              <strong>Your sign-ins.</strong> Each time you sign in, we record when it happened,
              your IP address and the type of app or browser you used. This keeps you signed in and
              protects your account.
            </p>
            <p>
              <strong>Your activity in the app.</strong> The challenges you create and join, your
              streak, and your workouts: the date and time, your time zone, the app version, and for
              each set the exercise, your goal, the reps or seconds counted, and details of each rep
              such as its timing, its depth and the tip the app gave you.
            </p>
            <p>
              <strong>Your league.</strong> Your points and your place each week, and whether you
              chose to show your name to others.
            </p>
            <p>
              <strong>Your choices.</strong> Whether you agreed to share movement data, when, and
              under which version of this policy.
            </p>
            <p>
              <strong>Movement data, only if you agree.</strong> While you exercise, the app follows
              points on your body, such as your shoulders, hips and knees. If you choose to share,
              we receive the positions of those points during each set. These are positions, not
              pictures. Along with them we receive the exercise, what the app counted, the lighting
              level, your phone’s model and Android version, and basic details of the camera used.
            </p>
          </section>

          <section>
            <h2>What stays on your phone</h2>
            <p>
              Videos of your workouts are never sent to us. They are stored only on your phone. The
              app removes each video after 30 days, and all of them are removed if you delete your
              account in the app or uninstall the app.
            </p>
          </section>

          <section>
            <h2>How we use your information</h2>
            <ul>
              <li>To sign you in and keep your account safe.</li>
              <li>
                To save your workouts and bring them back when you change or reset your phone.
              </li>
              <li>To run the weekly leagues.</li>
              <li>
                To make rep counting more accurate, using movement data from people who agreed to
                share it.
              </li>
            </ul>
          </section>

          <section>
            <h2>Who can see your information</h2>
            <p>
              <strong>Other people in your league.</strong> Each week you are placed on a board with
              up to 30 people. They can see your points. They see your first name, the first letter
              of your last name and your photo only if you turn on “Show my name”. Otherwise you
              appear without a name.
            </p>
            <p>
              <strong>Companies that help us run the app.</strong> Google provides sign-in. A
              hosting provider runs our servers and stores our data in data centres in North
              America, so your information may be kept outside your own country.
            </p>
            <p>We do not share your information with anyone else.</p>
          </section>

          <section>
            <h2>How long we keep it</h2>
            <p>
              We keep your information for as long as you have an account. Movement data is kept
              until you stop sharing or delete your account.
            </p>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>
              <strong>Stop sharing movement data.</strong> Open your profile in the app and turn off
              “Train the coach”. Your phone stops sharing straight away. The movement data you
              already shared is deleted from our servers as soon as your phone is next connected to
              the internet.
            </p>
            <p>
              <strong>Hide your name in the league.</strong> Turn off “Show my name” on the League
              tab.
            </p>
            <p>
              <strong>Delete your account.</strong> Open your profile in the app and choose “Delete
              account”. If you no longer have the app, use our{' '}
              <a href="/delete">account deletion page</a>.
            </p>
          </section>

          <section>
            <h2>What happens when you delete your account</h2>
            <p>
              You are signed out on every phone straight away, and your sign-in details are deleted
              immediately. Everything else we hold about you, including any movement data you
              shared, is deleted within 24 hours. We keep only a note that an account was deleted
              and when, so that the deletion can be completed. Backups kept by our hosting provider
              may hold deleted information for up to 30 more days before it is removed for good.
            </p>
          </section>

          <section>
            <h2>Changes to this policy</h2>
            <p>
              If we change this policy, we will update the date at the top of this page. The app
              will ask you again before any movement data is shared under a new version.
            </p>
          </section>
        </main>
      </body>
    </html>
  );
}

const STYLE = `
:root{color-scheme:dark}
body{margin:0;background:#0d0e0b;color:#f2f0e8;font:17px/1.45 system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:48px 24px;display:flex;flex-direction:column;gap:24px}
.mono{font:12px ui-monospace,monospace;letter-spacing:.1em;color:#a3a396}
h1{margin:0;font-size:40px;font-weight:200;line-height:1.05;letter-spacing:-.04em}
h2{margin:0 0 8px;font-size:20px;font-weight:500}
.version{margin:0;color:#a3a396;font-size:15px}
p{margin:0 0 12px;color:#c9c8bc}
p strong{color:#f2f0e8;font-weight:500}
ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;color:#c9c8bc}
a{color:#f2b544}
`;
