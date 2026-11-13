/** @jsxImportSource hono/jsx */

import { STYLE } from './privacy-page';

/**
 * The home page (`GET /`): Google's sign-in branding asks for one that says what the app does, why it
 * signs people in, and links the privacy policy. Plain HTML like the privacy page, under its policy.
 */
export function HomePage() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>RepRepGo</title>
        <style>{STYLE}</style>
      </head>
      <body>
        <main>
          <span class="mono">REPREPGO</span>
          <h1>Count your reps with your phone’s camera</h1>
          <p>
            RepRepGo is a workout app. Lean your phone against a wall, start a set, and it counts
            your push-ups, squats and other exercises, checks each rep and keeps your streak. Join
            daily challenges and a weekly league.
          </p>
          <p>
            You sign in with Google so your workouts, challenges and league place are kept with your
            account and follow you to a new phone.
          </p>
          <p>
            <a href="/privacy">Privacy policy</a> · <a href="/delete">Delete your account</a>
          </p>
        </main>
      </body>
    </html>
  );
}
