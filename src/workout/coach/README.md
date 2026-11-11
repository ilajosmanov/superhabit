# coach

The workout's spoken cues, independent of how the session is drawn.

| File        | Holds                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| `phrase.ts` | pure wording for reps, framing, finished tallies, the next step and phone placement |
| `speech.ts` | the speech actor: each phrase cuts the previous one; stopping goes silent           |

`phrase.test.ts` checks the wording; session tests cover muting and captions.

Completing the day says “Workout done.”; ending it early is “End workout” in the UI.
