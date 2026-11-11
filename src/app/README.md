# app

The routes (Expo Router): each file is a page's address. A route reads its params, composes a screen from
the features and navigates; anything with logic lives in the feature (`CODING_STANDARDS.md`, "Layers").
Routes may not import `useEffect` or `useLayoutEffect` (`AGENTS.md`).

| File                      | Page                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `_layout.tsx`             | the root: runs `bootstrap/startup`, mounts the shared snapshot, sign-in, consent, the error screen |
| `(tabs)/_layout.tsx`      | the tab bar                                                                                        |
| `(tabs)/index.tsx`        | Home: your streak and the picked day's log                                                         |
| `(tabs)/challenges.tsx`   | your runs, then the catalog                                                                        |
| `(tabs)/leaderboard.tsx`  | the League tab (`leaderboard/components/league-screen.tsx`)                                        |
| `(tabs)/me.tsx`           | Profile (`account/components/profile-screen.tsx`)                                                  |
| `challenge/[id].tsx`      | a challenge's page: join, today's session, its days                                                |
| `create.tsx`, `build.tsx` | making a challenge: pick an exercise, then set its numbers; `build` also edits one                 |
| `workout/[id].tsx`        | the camera session for a run or a surprise                                                         |
