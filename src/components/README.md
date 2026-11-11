# components

UI every feature may use (the shared layer under `workout/`, `challenges/` and the routes). Nothing here
knows a feature: no challenge, run or workout rules. Controls are Material's, from `@expo/ui`; build our
own only for what Material has no form of.

| File                 | What it is                                                                                                                       | When to use it                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `screen.tsx`         | `Screen`: the page shell (label row, title, scroll, footer, pull to refresh); `GUTTER`                                           | every screen; `GUTTER` for widths that fill the content column            |
| `sheet.tsx`          | the platform bottom sheet, as tall as what it holds                                                                              | a short explanation or a choice over the screen                           |
| `primary-button.tsx` | the lit amber key                                                                                                                | the screen's one action, as a tap                                         |
| `text-button.tsx`    | Material's text button in Geist                                                                                                  | secondary actions; `edge` at a row's end                                  |
| `icon-button.tsx`    | Material's icon button: a symbol or our own figure, 48dp                                                                         | an action shown as an icon; `checked` for a toggle; `edge` at a row's end |
| `switch-row.tsx`     | a label, what the value means, and Material's switch                                                                             | an on/off setting                                                         |
| `confirm-dialog.tsx` | the platform's dialog for a choice; `disabled` while its action runs                                                             | before something that can't be undone, or a choice that must be made      |
| `icon.tsx`           | a Material Symbol                                                                                                                | any icon; whatever holds it says what it means                            |
| `illustrations.tsx`  | our drawn figures: exercises (still or moving), the die, the empty day; the camera set-up and the dropped bar (the crash screen) | pictures no icon set has                                                  |
| `rep-loop.ts`        | `repAt`: where a figure's rep loop is at a time                                                                                  | `ExerciseMotion`'s clock                                                  |
| `waiting.tsx`        | a figure doing reps over a line of text                                                                                          | a full screen while something loads                                       |
| `avatar.tsx`         | your photo, or your initials                                                                                                     | wherever a person is shown                                                |
| `tick.ts`            | `tick(kind)`: Android's haptic feedback, a selection tick on iOS                                                                 | every haptic: detents, toggles, keys                                      |
| `save-failed.ts`     | `saveFailed()`: the alert for a write that didn't go through                                                                     | after a feature's write returns null                                      |

Colour tokens and `COMPOSE_LABEL` (a Compose button's label font) are in `src/theme.ts`.
