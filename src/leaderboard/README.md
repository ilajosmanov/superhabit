# Leaderboard

The League tab: this week's board, and whether others see your name. The server keeps the leagues and
counts the points (`server/src/leagues/`); the phone only shows them and needs the internet to.

| File                       | Holds                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `leaderboard.ts`           | `leaderboard`: the tab's machine. Loads the board, asks once whether to show your name, saves the switch |
| `components/standings.tsx` | the board by rank: your place lit, a hairline where moving up ends and moving down starts                |

The tab loads afresh each time it opens (`app/(tabs)/leaderboard.tsx` remounts it on focus). Opening it
the first time puts you on a Bronze board. Until you answer whether to show your name, it asks; Stay
hidden is an answer, a tap outside isn't. Hidden, you still compete and see your place; others see
"Hidden athlete". The switch shows its new place at once; if saving fails, the board is read again,
so it shows what the server has.
