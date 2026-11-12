# Streak

One personal streak across the whole app, shown on Home (the first tab). Any saved workout with counted
activity increases it; completing all challenges is not required. Individual challenge progress stays separate.

Scheduled rest preserves the number without increasing it: 5 → rest → 5 → workout → 6. It does not
start or revive a streak, earn activity credit, or earn/spend a freeze. Progress toward the next freeze
pauses. A workout on rest still counts normally. Home uses a distinct REST marker and protected status.

Recovery dates come from `challenges/rest-days.ts`, not from the absence of a workout: at least one
challenge must be active, and all active challenges must prescribe rest. One resting plan cannot
excuse an obligation in another. The live view and freeze writer use this same projection. The server
also uses it for the leaderboard bonus, including the bundled current and historical suggestions.

| File                          | Holds                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `streak.ts`                   | the rules: alive, frozen and missed days, freezes earned and used                            |
| `store.ts`                    | `keepFreezes`: writes the freezes of days that are over, with outbox rows                    |
| `streak-live.ts`              | `useStreak(today)`: the streak, re-read as workouts are saved                                |
| `components/streak-panel.tsx` | the Home panel: days in a row, today's status, 13 weeks of squares to pick a day on, freezes |
| `components/streak-grid.ts`   | the 13-week grid layout, picked-day wording and the day under a tap                          |

Freezes are off (`FREEZES` in `streak.ts`): they are paid in the Monetization Plan and there is no paid
tier yet. Off, nobody earns one, no day is frozen, no event is written and the panel hides its FREEZES row;
the rules below stay, tested with the switch on.

A day is alive when a done workout started on it has a counted rep or hold, from any challenge or a free
log. Every 7 alive days in a row earn a freeze (hold 2); a missed day with one held is frozen. The streak
is computed from alive days every time it is shown. Freeze events are only its record for the server:
nothing reads them back, so a day another phone later makes alive is simply alive. They are written at
launch and at each new day (`bootstrap/startup.ts`), never for today, and not while a workout is open,
because one started before midnight may still make yesterday alive.

Alive days are `aliveDays` in `streak.ts`, over the shared snapshot on Home and over the rows
`workout/store.ts` reads (`workoutRows`, `setRows`) in `keepFreezes`. Tests: `streak.test.ts` works the
rules by hand; `store.test.ts` writes real workouts to Node SQLite.
`aliveDays` uses `workout/plan/results.ts`'s `countedWorkouts`, also used by the challenge day log.
`components/streak-grid.test.ts` covers the layout, wording and taps independently of the streak rules.
