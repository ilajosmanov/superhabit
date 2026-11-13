# components

UI owned by workout. Routes compose these screens with other features; workout logic imports none of it.

| File                                                   | Holds                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `session-screen.tsx`, `slid-in.ts`                     | session gates, camera and screen composition after navigation settles |
| `camera-permission.tsx`                                | asking for the camera, or sending you to Settings once denied         |
| `recover-prompt.tsx`                                   | Save / Discard prompts for a workout left open                        |
| `live-view.tsx`, `between-sets.tsx`                    | camera overlays during a set and while the phone moves                |
| `countdown.tsx`, `rest-view.tsx`                       | the countdown and the rest, read from 2–3 m away                      |
| `time-left.tsx`, `goal-line.tsx`                       | time left as a draining amber line; a goal in far-reading type        |
| `set-platter.tsx`, `platter-header.tsx`                | platter composition, props and header                                 |
| `live-set.tsx`, `paused-set.tsx`, `position-check.tsx` | each platter state                                                    |
| `phone-setup.tsx`, `controls.tsx`                      | phone placement and shared workout controls                           |
| `rep-count.tsx`, `rep-strip.tsx`                       | counts and attempt history                                            |
| `depth-gauge.tsx`                                      | the live depth gauge (its maths is `lib/depth.ts`)                    |

Screens you see mid-workout have two reading distances: the far layer (the clock, the exercise and its
goal) is big enough to read from the start position; instructions and buttons are for leaning in.

`controls.test.ts` checks the caption’s TalkBack policy.
Native interaction tests need their own test setup.

The route keys `SessionGate` by its route id so each session gets a fresh workout id. Permission pages
and the session leave through callbacks from the route. The machine owns leaving and write failures;
React keeps only the discard dialog open/closed. Restart uses a Material text button and asks before
clearing a set with attempts or held time. Coach captions announce through TalkBack only while muted.
