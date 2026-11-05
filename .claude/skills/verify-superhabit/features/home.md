# Home and navigation

The home screen greets the user and links to the squat test. The squat screen is also reachable by deep link.

## Sub-features

- `home-render` shows `Hello World` and the `Squat test →` link on the dark ground.
- `home-to-squat` opens the squat screen from the link.
- `home-deeplink` opens the squat screen from `superhabit://squat`.
- `home-back` returns from the squat screen to home with the system back gesture.

## How to get to it (user POV)

- Launch the app from the launcher.
- Tap `Squat test →`.
- Open `superhabit://squat` from another app or from adb.

## Driving it with sv

Preconditions:

- Baseline from the index. Camera permission granted.

- **Render.** Cold start. Run `$SV reload`, `$SV shot home/home` and `$SV ui > "$($SV evidence)/home/home.xml"`. The tree has `Hello World` and `Squat test →`, and the shot shows light text on the near-black ground.
- **Open squat screen.** Tap the link. Run `$SV tap "Squat test →"` and `$SV wait "Reset" 20`. The squat panel appears with `Reset`, and the tree no longer has `Hello World`.
- **Proof of open.** Run `$SV shot home/squat`. The shot shows the camera area and the panel with a rep count of `0`.
- **Back.** Run `adb shell input keyevent KEYCODE_BACK` and `$SV wait "Hello World"`. Home is shown again.
- **Deep link.** Run `$SV open squat` and `$SV wait "Reset" 20`. The squat screen opens without going through the home link.
- **Logs.** Run `$SV log home/js`. There's no redbox or `[squat] … failed` line.

## Gotchas

- `Squat test →` includes the arrow character. `sv tap` matches the whole string exactly.
- Leaving the squat screen stops the session, which closes the native detector. A crash right after back is a cleanup bug, not a navigation bug, so capture `adb logcat -d -b crash` as well.
- On a cold start, the squat screen can take several seconds to show `Reset` while the pose model loads on the GPU. Wait up to 20 s.
