# components

UI owned by workout. Routes compose these screens with other features; workout logic imports none of it.

| File                                                   | Holds                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `session-screen.tsx`, `slid-in.ts`                     | session gates, camera and screen composition after navigation settles |
| `recover-prompt.tsx`                                   | Save / Discard prompts for a workout left open                        |
| `live-view.tsx`, `between-sets.tsx`                    | camera overlays during and between sets                               |
| `set-platter.tsx`, `platter-header.tsx`                | platter composition, props and header                                 |
| `live-set.tsx`, `paused-set.tsx`, `position-check.tsx` | each platter state                                                    |
| `phone-setup.tsx`, `controls.tsx`                      | phone placement and shared workout controls                           |
| `rep-count.tsx`, `rep-strip.tsx`                       | counts and attempt history                                            |
| `depth-gauge.tsx`, `depth.ts`                          | the gauge and its pure depth calculations                             |

`depth.test.ts` checks the gauge calculations; native components need their own test setup.
