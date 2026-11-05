# Superhabit verification map

This is the maintained source for verifying Superhabit's user-facing behavior on the Android phone. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Exactly one adb device: the user's phone (USB debugging on), unlocked and propped up facing the room.
- `$SV launch` ran in this session (`SV=.claude/skills/verify-superhabit/bin/sv`) and `$SV doctor` prints no `FAIL`.
- Metro logged a fresh `Android Bundled` line after the last code change (`launch` or `reload`).
- The app starts on the home screen, which shows `Hello World`.
- Camera permission is granted unless the journey says otherwise. Use `$SV perm`, never the system Settings UI.

## Driving conventions

- Start every journey from the home screen. Run `$SV reload` to get back there from anywhere.
- Use exact visible strings as handles (`Squat test →`, `Allow camera`, `Reset`). Never use raw coordinates.
- Use `$SV wait` for state changes, not fixed sleeps.
- When a journey needs a person in front of the camera, ask the user to do the movement, and capture while they do it.

## Proof and skip reporting

- Each journey captures a before shot/dump, the action, and an after shot/dump, under `.verify/<run-id>/<feature-id>/`.
- JS side effects are proved with `$SV log <feature-id>/js`. A run with `frame processing failed`, `frame scheduling failed` or a redbox in `metro.log` fails.
- Record the entry point used (home link or deep link) with every artifact.
- A journey that needs the user's body and didn't get it is reported **unverified**, with the reason. It is never reported as passed through a weaker path.

## Feature entry contract

Each feature file starts with an H1 title and a paragraph describing the user-visible behavior. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with sv`, `Gotchas`. Keep implementation details out of the map.

## Features

- [Home and navigation](./home.md): the home screen, the link to the squat test, and the `superhabit://squat` deep link.
- [Camera permission](./camera-permission.md): the rationale screen, the `Allow camera` flow, and the denied path.
- [Squat session](./squat-session.md): the live front-camera preview, the pose dots, the rep and no-rep counters, rep stats, spoken feedback, and `Reset`.
