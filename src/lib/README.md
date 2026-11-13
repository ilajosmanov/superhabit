# lib

Small internal libraries every layer may use (Feature-Sliced Design's `shared/lib`). Each file has one
area of focus and is plain TypeScript: no React, React Native, Expo or XState, and no import of our own
code. Lint holds it to that.

| File          | Focus                                                               |
| ------------- | ------------------------------------------------------------------- |
| `text.ts`     | text as we show it: `capitalise` a name                             |
| `duration.ts` | time as we show it: `mss`, 312 s → "5:12"                           |
| `day.ts`      | local `YYYY-MM-DD` days: `today`, `addDays`, labels, next midnight  |
| `depth.ts`    | a rep's depth on a gauge: `depthAt` (0 top … 1 bottom), `depthText` |

What does not go here: anything that knows about exercises, workouts or challenges (that is a feature's
or `exercises/`), UI (`components/`), and catch-alls: no `utils.ts` or `helpers.ts`. A new file names its
focus. Move code here when a second layer needs it, not before.
