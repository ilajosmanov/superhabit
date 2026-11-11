# Leaderboard

The League tab: this week's board, and whether others see your name. The server keeps the leagues and
counts the points (`server/src/leagues/`); the phone only shows them and needs the internet to.

| File                           | Holds                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `leaderboard.ts`               | `leaderboard`: the tab's machine (loads, refreshes, asks once whether to show your name, saves the switch); `stakes` and `endsIn`, what the tab says |
| `components/league-screen.tsx` | the League tab: your place, the board, the switch, and why the board may be out of date                                                              |
| `components/standings.tsx`     | the board by rank: your place lit, a hairline where moving up ends and moving down starts                                                            |

The machine loads your board at launch, which puts you on a Bronze board the first time, and reads it
again each time the tab gains focus, the app comes back to the front while the tab is open (its own
`AppState` actor; the route passes React Navigation's `focus` and `blur`, so another tab in front reads
nothing) or you tap refresh. The last board stays on screen meanwhile; a read
that fails keeps it, marked as possibly out of date with why (no internet, the server between weeks, or
the session ended, which offers Sign in again). Once the week's end has passed when the board was last
read or tried, it says the week has ended instead of a countdown. Until you answer whether to show your
name, it asks; Stay hidden is an answer, a tap outside isn't. Hidden, you still compete and see your
place; others see "Hidden athlete". The switch shows your choice while it is saved, then only what the
server confirmed: if saving fails, the board is read again, so it shows what the server has, and if that
fails too, the last answer the server gave.
