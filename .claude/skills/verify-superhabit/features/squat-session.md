# Squat session

A squat test: with the phone propped up 2–3 m away, the front camera shows the user with amber pose dots on visible joints. Clean squats raise the big rep count, shallow or bad ones raise `NO-REPS`, and each rep shows depth, symmetry, down/up time, lean and form cues. Reps are announced by voice, and `Reset` zeroes the counters.

## Sub-features

- `squat-preview` shows a live front-camera preview in a 4:3 box with a black background outside it.
- `squat-panel` shows a rep count `0`, a phase label (`WAITING` until a person stands in frame, then `UP`/`DOWN`), `NO-REPS 0` and `Reset` before any movement.
- `squat-dots` draws amber dots on the visible landmarks of a person in frame, mirrored to match the preview.
- `squat-count` counts a full squat as a rep, and a shallow one as a no-rep.
- `squat-stats` shows a stats line after a rep: `<depth>° · SYM <n>° · <down>s↓ <up>s↑ · LEAN <n>°` and any cues.
- `squat-voice` speaks the rep feedback (en-US), cutting off the previous phrase.
- `squat-reset` sets reps and no-reps back to 0 and keeps the camera running.

## How to get to it (user POV)

- From home, tap `Squat test →`, or open `superhabit://squat`. Camera permission must be granted.

## Driving it with sv

Preconditions:

- Baseline from the index, with camera permission granted.
- For `squat-dots`, `squat-count`, `squat-stats` and `squat-voice`: **the user is standing in front of the phone, fully in frame, 2–3 m away**. Ask them first and wait for a yes. An agent alone can't produce these.

- **Open.** Run `$SV tap "Squat test →"`, `$SV wait "Reset" 20` and `$SV ui > "$($SV evidence)/squat/open.xml"`. The tree has `0`, `NO-REPS 0` and `Reset`. Run `$SV shot squat/open`. The shot shows the live camera image, not black or frozen.
- **Live preview.** Take a second shot about 2 s later with `$SV shot squat/open-2`. The two images differ in the camera area, which proves the preview is live.
- **Pose dots (user needed).** Ask the user to stand in frame. Run `$SV shot squat/dots`. Amber dots sit on the user's joints and move with them.
- **Count (user needed).** Ask for 3 deep squats and 1 shallow half-squat, then run `$SV shot squat/after-reps`, `$SV ui > "$($SV evidence)/squat/after-reps.xml"` and `$SV log squat/js`. The big number is `3`, the tree has `NO-REPS 1`, a stats line with `SYM` and `LEAN` is shown, and the JS log has one `[squat] DOWN` line per descent. Ask the user whether they heard each rep spoken.
- **Reset.** Run `$SV tap "Reset"`, `$SV wait "NO-REPS 0"` and `$SV shot squat/reset`. The count is back to `0` and the preview is still live.
- **Health.** Check `squat/js.log` and `metro.log` for `frame processing failed`, `frame scheduling failed`, `frame dispose failed` or a redbox. Any of these fails the run.

## Gotchas

- The exact rep counts depend on the user's form and the detector, so `3` from "3 deep squats" is a proof only if the user confirms that they did exactly that. Record what they say they did.
- `uiautomator dump` can fail on this screen because the camera preview keeps the UI busy. `sv` retries, and if it still fails, assert from the screenshot.
- Speech can't be captured over adb. Only the user can confirm it, so report `squat-voice` as user-confirmed or unverified.
- The phase label and the counters only re-render when they change. A frozen number with no person in frame is correct, not a hang.
- A black preview usually means the phone is face-down or another app holds the camera. Check `adb shell dumpsys media.camera | grep -i "client package"` before calling it a bug.
