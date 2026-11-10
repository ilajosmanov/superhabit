# coach

The workout's spoken cues, independent of how the session is drawn.

| File        | Holds                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| `phrase.ts` | pure phrases for reps, form, framing, set end and the next step           |
| `speech.ts` | the speech actor: each phrase cuts the previous one; stopping goes silent |

`phrase.test.ts` checks the wording; session tests cover muting and captions.
