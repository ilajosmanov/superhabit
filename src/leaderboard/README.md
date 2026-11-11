# Leaderboard

The League tab: this week's board, and whether others see your name. The server keeps the leagues and
counts the points (`server/src/leagues/`); the phone only shows them and needs the internet to.

| File                           | Holds                                                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `leaderboard.ts`               | `leaderboard`: the tab's machine (loads, refreshes, asks once whether to show your name, saves the switch, remembers which week's close you saw); `standing`, `lastWeekWords`, `bonusOf`, `endsIn`, `weekDay`, `weekLetters`, `closesAt`: what the tab says |
| `store.ts`                     | the last week whose close you saw on this phone (a `settings` row)                                                                                                                                                                                          |
| `components/league-screen.tsx` | the League tab: last week's close once, then your place, the board, the switch, (?) and pull to refresh; Score your first points while you have none                                                                                                        |
| `components/your-place.tsx`    | your place (or 0), the league's steps, the one gap worth acting on in points, the week, the streak bonus; the rules the first time                                                                                                                          |
| `components/standings.tsx`     | the board in parts (move up, stay, drop), each headed; your place lit, a hairline per name sized by points                                                                                                                                                  |
| `components/week-result.tsx`   | how last week closed: the amber dot climbs or drops the league steps                                                                                                                                                                                        |
| `components/points-sheet.tsx`  | (?) How points count, from the server's own table                                                                                                                                                                                                           |

The machine loads your board at launch, which puts you on a Bronze board the first time, and reads it
again each time the tab gains focus, the app comes back to the front while the tab is open (its own
`AppState` actor; the route passes React Navigation's `focus` and `blur`, so another tab in front reads
nothing) or you pull down to refresh. The last board stays on screen meanwhile; a read
that fails keeps it, marked as possibly out of date with why (no internet, the server between weeks, or
the session ended, which offers Sign in again). Once the week's end has passed when the board was last
read or tried, it says the week has ended instead of a countdown. Until you answer whether to show your
name, it asks; Stay hidden is an answer, a tap outside isn't. Hidden, you still compete and see your
place; others see "Hidden athlete". The switch shows your choice while it is saved, then only what the
server confirmed: if saving fails, the board is read again, so it shows what the server has, and if that
fails too, the last answer the server gave.

The board says gaps in points only, never as a number of some exercise (2026-11-11: no nudging from your
history). The server sends what a point is worth (`rates`, `bonus`), so the phone keeps no copy of the
scoring. Last week's close shows once per week on this phone; signing out clears what was seen.
