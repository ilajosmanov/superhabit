# Streak

One personal streak across the whole app, shown on Home (the first tab).

| File                          | Holds                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `streak.ts`                   | the rules: alive, frozen and missed days, freezes earned and used; the grid's weeks, the day under a tap |
| `store.ts`                    | `keepFreezes`: writes the freezes of days that are over, with outbox rows                                |
| `streak-live.ts`              | `useStreak(today)`: the streak, re-read as workouts are saved                                            |
| `components/streak-panel.tsx` | the Home panel: days in a row, today's status, 13 weeks of squares to pick a day on, freezes             |

A day is alive when a done workout started on it has a counted rep or hold, from any challenge or a free
log. Every 7 alive days in a row earn a freeze (hold 2); a missed day with one held is frozen. The streak
is computed from alive days every time it is shown. Freeze events are only its record for the server:
nothing reads them back, so a day another phone later makes alive is simply alive. They are written at
launch and at each new day (`bootstrap/startup.ts`), never for today, and not while a workout is open,
because one started before midnight may still make yesterday alive.

Alive days are `aliveDays` in `streak.ts`, over the shared snapshot on Home and over the rows
`workout/store.ts` reads (`workoutRows`, `setRows`) in `keepFreezes`. Tests: `streak.test.ts` works the
rules by hand; `store.test.ts` writes real workouts to Node SQLite.
