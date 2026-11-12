# components

UI every feature may use (the shared layer under `workout/`, `challenges/` and the routes). Nothing here
knows a feature: no challenge, run or workout rules. Controls are Material's, from `@expo/ui`; build our
own only for what Material has no form of.

| File                 | What it is                                                                                                                  | When to use it                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `screen.tsx`         | `Screen`: the page shell (label row, title, scroll, footer, pull to refresh); `GUTTER`                                      | every screen; `GUTTER` for widths that fill the content column            |
| `feedback-sheet.tsx` | `FeedbackButton`: dismissible workout check-in, Profile feedback and crash feedback using the shared controls               | collecting optional feedback                                              |
| `feedback.ts`        | validates and submits explicit feedback to Sentry; only crash feedback attaches to an error                                 | the feedback sheet                                                        |
| `snackbar.tsx`       | a capsule toast (ours: Material's snackbar takes no Geist); `useSnackbar()` shows a message                                 | in-app confirmations without changing controls                            |
| `sheet.tsx`          | the platform bottom sheet, as tall as what it holds                                                                         | a short explanation or a choice over the screen                           |
| `primary-button.tsx` | the lit amber key                                                                                                           | the screen's one action, as a tap                                         |
| `tonal-button.tsx`   | Material's filled tonal button, 60dp tall and sized to its label                                                            | a footer's second action beside the primary                               |
| `text-button.tsx`    | Material's text button in Geist                                                                                             | secondary actions; `edge` at a row's end                                  |
| `icon-button.tsx`    | Material's icon button: a symbol or our own figure, 48dp                                                                    | an action shown as an icon; `checked` for a toggle; `edge` at a row's end |
| `segments.tsx`       | Material's segmented row, as wide as its parent                                                                             | one choice of a few (days, the theme)                                     |
| `colors.tsx`         | `useColors()`: the palette in force, light or dark; `Night`: a part that stays dark                                         | a prop that takes a colour value; `Night` around the camera and video     |
| `switch-row.tsx`     | a label, what the value means, and Material's switch                                                                        | an on/off setting                                                         |
| `confirm-dialog.tsx` | the platform's dialog for a choice; `disabled` while its action runs                                                        | before something that can't be undone, or a choice that must be made      |
| `icon.tsx`           | a Material Symbol                                                                                                           | any icon; whatever holds it says what it means                            |
| `illustrations.tsx`  | our drawn figures: exercises, the die, the empty day, the check-in's `TrackedFigure`; the camera set-up and the dropped bar | pictures no icon set has                                                  |
| `rep-loop.ts`        | `repAt`: where a figure's rep loop is at a time                                                                             | `ExerciseMotion`'s clock                                                  |
| `waiting.tsx`        | a figure doing reps over a line of text                                                                                     | a full screen while something loads                                       |
| `avatar.tsx`         | your photo, or your initials                                                                                                | wherever a person is shown                                                |
| `tick.ts`            | `tick(kind)`: Android's haptic feedback, a selection tick on iOS                                                            | every haptic: detents, toggles, keys                                      |
| `save-failed.ts`     | `saveFailed()`: the alert for a write that didn't go through                                                                | after a feature's write returns null                                      |

The two palettes (`dark`, `light`) and `COMPOSE_LABEL` (a Compose button's label font) are in `src/theme.ts`.
Classes (`text-chalk`) follow the theme by themselves; a value comes from `useColors()`, never from a
palette by name, except in what is always dark (`workout/`, the video viewer).
