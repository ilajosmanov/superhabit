# exercises

Pure rep logic: pose dots in, reps, failed reps and held time out. No React, Expo or XState here,
so plain tests cover all of it.

An exercise is built from primitives, each in its own folder:

```ts
plank   = exercise(hold(plankPosition), labels)
push-up = exercise(cycle(plankPosition, jointAngle('elbow'), thresholds), labels)
squat   = exercise(cycle(standingPosition, bothSides(jointAngle('knee'), 35), thresholds), labels)
burpee  = exercise(sequence([standingPosition, plankPosition], { maxStepMs }), labels)
```

Labels are the name, the phone spot and its setup copy, and the hint. The kind works out the rest
from its position and measure: the start heading, the body parts to frame, the gauge and the stats
line.

| Folder       | Holds                                                         |
| ------------ | ------------------------------------------------------------- |
| `kinds/`     | how counting works: cycle, hold, sequence                     |
| `positions/` | which body position you are in, and whether your form is good |
| `measures/`  | what moves: a joint angle, an elevation, the feet's spread    |
| `body/`      | reading the pose dots: geometry, smoothing, recorded traces   |

This top level holds only the exercises themselves (`plank.ts`, `pushup.ts`, …), `exercise.ts`
(labels, and `exercise()` to join them to a kind), `registry.ts` (the list of exercises) and
`trace-file.ts` (a set's recorded trace file, below). Other folders import from `registry.ts`.

Every exercise is a short config on these primitives; the plan is in the "Superhabit primitives"
doc.

Tests replay recorded clips (`.sht`, below) from `__fixtures__/traces/`, which is git-ignored: see
`AGENTS.md`. Clip tests keep the hand-checked counts and spans; the files keep what the phone counted.

`COUNTER_VERSIONS` in `registry.ts` is a hand-bumped semver for every exercise. Bump it when counting
rules change. Cycle and sequence reports expose `startMs`, `bottomMs` and `endMs` on the detector clock,
for counted and failed attempts. Cycles reuse their start/extreme tracking; `downMs` and `upMs` remain
durations. A sequence starts at its last idle start-position frame, spans all intermediate positions,
and has no bottom or depth. Reset/tracking expiry drops the unfinished attempt. Holds report breaks,
with null timing fields, and produce no attempts.

## Trace v2 (`.sht`, `trace-file.ts`)

One file per set, readable without the app's database. It sits here, not in `body/`, because its header
describes the set (exercise, counter version, consent, takes), not only the pose dots.
`encodeTrace(info, frames)` makes it and `decodeTrace(bytes)` reads it back (`Uint8Array` both ways; no
file system here). The decoder throws on anything but a whole, valid file. Decoded frames feed `toPose`,
so replay runs on them.

- **Container:** gzip (fflate) of `SHT2`, the header length (uint32 LE), the JSON header, a time column
  of int32 deltas in ms (the first frame is 0), then one int16 column per value, all little-endian.
- **Columns** (272 plus time): `person`; per joint `image.<joint>.{x,y,z,visibility,presence}`;
  `world.<joint>.{x,y,z}` (world visibility equals image visibility in MediaPipe, so it is not
  repeated); `down.{x,y,z}`; `phase` and `waiting` (indices into the header's lists); `inferenceMs`;
  `brightness` (mean luma, 0–255).
- **Values:** stored as `round(value × scale)`, as wrap-around deltas from the previous frame; −32768 is
  missing (no person, no gravity, not measured yet). Default scales: image x/y 8000, z 5000, visibility,
  presence, world and gravity 10000, inference and brightness 100. A value past its column's range
  halves that column's scale for the file until it fits; flags and list indices stay at 1.
- **Glitches:** a NaN or out-of-range point drops that frame's person; bad gravity or presence drops just
  that; a bad reading is null. One frame is lost, never the set.
- **Header:** exercise, set id, counter version, the source of a converted public clip, device and
  camera (null for clips recorded before they were noted), takes (in order; take i is filmed to
  `<setId>-<i>.mp4`, with its video clock anchor in file time), consent, what the counter `counted`,
  hand-checked `labels` kept apart, the phase and waiting-reason lists, the frame count and the columns.
