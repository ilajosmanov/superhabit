---
name: verify-superhabit
description: Drive the Superhabit Expo app on the USB-connected Android phone (adb + uiautomator + Metro in tmux) to prove a change works the way a user sees it, with screenshots, UI dumps and JS logs as evidence. Use after changing screens in src/app/, the squat session, speech, or the native pose module, and whenever "tests pass" is not proof enough.
---

# Verify Superhabit on the phone

Superhabit is an Expo (SDK 58) React Native app. The real surface is the **Android dev build on a physical phone** over USB: there is no emulator on this machine, the iOS build needs macOS, and the web build has no camera or pose tracking. Everything below drives that phone through `bin/sv`, a bash helper next to this file.

```
SV=.claude/skills/verify-superhabit/bin/sv   # run from the repo root
```

The feature map in [`features/README.md`](features/README.md) lists what to drive and what proves it. Read it before you pick a journey.

## Isolation: one phone, one Metro, one run

There is one phone, one installed app (`com.anonymous.superhabit`) and one Metro port (8081). **Two runs cannot go side by side.** `sv launch` refuses when its tmux session already exists or when 8081 is held by a Metro it did not start (the user's own `vp run android`). In that case stop and ask the user. Never kill their Metro, and never drive a session you did not launch.

## Launch

```
RUN_ID=<short-name> $SV launch
```

This runs the project's own dev command, `vp run android` (`expo run:android --device`: Gradle build, install, `adb reverse tcp:8081`, Metro), in the tmux session `superhabit-verify`. Metro output is mirrored to `.verify/<run-id>/metro.log`. Launch also:

- refuses if the phone is locked (a PIN lock needs the user, so ask them to unlock it),
- records the phone's `stay_on_while_plugged_in` setting and keeps the screen on while on USB,
- clears logcat so the logs you capture belong to this run.

**Ready** means Metro logged `Android Bundled …` _and_ the home screen shows `Hello World` in the UI tree. An incremental build takes about 1–2 minutes and a clean one longer. Launch waits up to 10 minutes.

Native changes (anything in `modules/pose/android`, `app.json`, native deps) need a full `launch`. A JS-only change while launched needs `$SV reload`: a cold start that waits for a fresh `Android Bundled` line, so the phone runs current source. A stale bundle on the phone once made every result in a session worthless, so **confirm a fresh `Android Bundled` line before trusting anything**.

## Doctor

```
$SV doctor
```

This is read-only. It checks: one adb device, phone unlocked, our tmux session exists, the Metro on 8081 descends from our tmux pane, `/status` says `packager-status:running`, `adb reverse tcp:8081` is set, the app process is alive, and the app is the resumed activity. Run it first whenever anything looks off. Any `FAIL` means don't drive yet.

## Drive

The handles are the visible text and accessibility labels in the uiautomator tree. Never use coordinates you computed yourself, because `sv tap` reads the bounds from the live tree.

| Command                                 | Does                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `$SV ui`                                | Prints the uiautomator XML of the current screen.                                  |
| `$SV has "<text>"`                      | Exits 0 if a node's `text` or `content-desc` is exactly that.                      |
| `$SV wait "<text>" [secs]`              | Polls until that node appears (default 15 s).                                      |
| `$SV tap "<text>"`                      | Taps the centre of the first node with that exact `text`/`content-desc`.           |
| `$SV open <route>`                      | Deep link `superhabit://<route>`, e.g. `$SV open squat`.                           |
| `$SV perm revoke\|grant`                | Changes the camera permission. The original is recorded and `cleanup` restores it. |
| `$SV reload`                            | Cold-starts the app on a fresh bundle from our Metro.                              |
| `tmux send-keys -t superhabit-verify r` | Metro hot reload (keeps native state; prefer `reload` for proof).                  |

The uiautomator tree is accessibility-based: a RN `<Text>` shows up with its string as `text`. Text that renders as a single string (for example `NO-REPS 0`) matches only in full, so use `$SV ui | grep` for partial checks.

## Evidence

Everything goes to `.verify/<run-id>/` in the repo (gitignored). It survives `cleanup`.

| Command                                 | Captures                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `$SV shot <name>`                       | Screenshot to `.verify/<run-id>/<name>.png`. View it with the Read tool. |
| `$SV ui > "$($SV evidence)/<name>.xml"` | UI tree, for text/state assertions.                                      |
| `$SV log <name>`                        | `ReactNativeJS` logcat since launch (`console.log`/`error` from JS).     |
| `metro.log`                             | Metro output, including bundle lines and JS errors (redbox causes).      |

Proof standards:

- Drive the real user path: tap `Squat test →` from home, not only the deep link, unless the journey is about the deep link. Grant or revoke permissions only to set up a precondition that the journey names.
- Capture the action _and_ the resulting state: a shot or UI dump before and after the tap.
- Check the side effects too. For pose work, that means the JS log (`[squat] …` lines), not just the screen.
- `sv log` must not contain `[squat] frame processing failed` / `frame scheduling failed` / a redbox for the run to count.
- Anything that needs a human body in front of the camera (rep counting, pose dots on a person) **cannot be proved by an agent alone**. Ask the user to do it while you capture, and report it unverified if they can't. Never fake it with a fixture or by sending internal events.

## Cleanup

```
$SV cleanup
```

This kills only the tmux session `superhabit-verify`, which is the Metro this run started. It restores the camera permission if `perm` changed it, restores the screen-stay-on setting, and removes the scratch state in `$XDG_RUNTIME_DIR/superhabit-verify`. It leaves the app installed (that's the user's dev build) and **keeps `.verify/<run-id>/`**. Run it after every run, including failed ones.

## Gotchas

- The phone has a PIN. If `launch` or `doctor` says locked, ask the user to unlock it, because you can't.
- `uiautomator dump` needs an idle UI, and the live camera preview rarely idles, so `sv` retries 5 times. If it still fails on the squat screen, fall back to `sv shot` and read the screenshot.
- The squat screen is portrait, uses the front camera and shows `contain` letterboxing. A phone face-down on the desk gives a black preview, which is not a bug.
- `vp run android` always prompts `Select a device/emulator`, even with one device, and `sv launch` answers it with Enter. With more than one adb device, `sv` refuses, because Enter would pick whichever device is listed first. Unplug the others.
