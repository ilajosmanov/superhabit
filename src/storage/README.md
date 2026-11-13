# storage

What is kept on the phone and how. No UI and no feature rules: a feature says what it keeps.

| File              | Holds                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `schema.ts`       | the SQLite tables (Drizzle)                                                                               |
| `relations.ts`    | how the tables join, for `db.query.<table>.findMany({ with })`                                            |
| `database.ts`     | the one database (`reprepgo.db`, foreign keys on): `migrateDatabase()`, `db()`                            |
| `outbox.ts`       | `enqueue`: a change for the server, written in the caller's transaction                                   |
| `account.ts`      | the kept account: read, write, `userId()` (whose data it is); its rules: `account/`                       |
| `consent.ts`      | your answer to sharing traces, as kept here (`null` before it's asked)                                    |
| `clear.ts`        | `clearDatabase`: every table emptied in the caller's transaction                                          |
| `theme-choice.ts` | light, dark or the phone's theme: in `expo-sqlite/kv-store`, not the database, so it outlives signing out |
| `trace-file.ts`   | a set's recorded trace (`.sht`): the format, packed as the set runs, read back                            |
| `set-files.ts`    | per-set trace/video paths, listing, deletion, temp sweeping and file availability                         |

After changing `schema.ts`, run `vp exec drizzle-kit generate` and commit `migrations/`. Until the first
release there is one `init` migration: delete it and generate again rather than adding one.

The startup machine (`bootstrap/startup.ts`) opens the database and applies the migrations, so a
failure shows Retry instead of crashing; `db()` throws if anything reads before that.

Writes are synchronous `db.transaction(...)` calls with no `await` inside. Each feature's store builds
its queries. Screens never subscribe themselves: one `LibraryProvider` (`challenges/library-live.tsx`)
keeps seven reads live with `useLiveQuery` (challenges, challenge versions, runs, workouts, sets, the
account row and your sharing answer) and shares the snapshot (see "Reading data on screens" in CODING_STANDARDS.md).
`streak_events`, `outbox`, `sync_cursors` and the rest of `settings` aren't live: their features read
them when they need them.

Tests that need real SQL mock `@/storage/database` with `__fixtures__/database.ts`: Node's own SQLite in
memory, migrated from the same files.

## Trace v2 (`.sht`, `trace-file.ts`)

One file per set, readable without the app's database. No file system here: the workout recorder writes
it. `traceBuilder()` packs a set frame by frame as it runs (`add`), and `bytes(info)` gives the whole
file before gzip in one quantizing pass; the recorder gzips and writes it natively. `encodeTrace(info,
frames)` is the same builder plus fflate's gzip, for tests and tools, and `decodeTrace(bytes)` reads a
file back; it throws on anything but a whole, valid file.

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
  camera (null for clips recorded before they were noted; `camera.fps` is measured over the set's
  frames, null when it can't be), optional `device.delegate` (`gpu`/`cpu`),
  takes (in order; take i is filmed to
  `<setId>-<i>.mp4`, with its video clock anchor in file time), consent, what the counter `counted`,
  hand-checked `labels` kept apart, the phase and waiting-reason lists, the frame count and the columns.

Videos: `documents/<userId()>/videos/<setId>-<i>.mp4`; `video_t_ms = t − videoAnchorMs`.

`set-files.ts` owns these paths and the traces: `documents/<userId()>/traces/<folder>/<setId>.sht` (plus
`.sht.tmp` while written). The folder is the upload queue: `pending/` (recorded while sharing was on, not
sent yet), `sent/`, `unread/` (the server couldn't read it) and `private/` (never leaves the phone).
`roomToFilm` is false under 1 GB free: sets are then counted without filming.
It knows no workout rules: callers choose which set ids to delete. `deleteTraces` removes final and
temporary files from all four trace folders on discard. A saved set's trace is never deleted: the
workout's 30-day sweep removes videos only, and traces go when the account does. `videoIndex` groups
all existing files once in numeric take order, preserving gaps, and excludes sets whose files are
still reserved for writing. `sharedVideos` keeps one listing per account for `VideosProvider`: storage
drops it and tells `subscribeVideos` listeners when a retake hides a playable set, a set's last pending
take releases, or a video is removed. Retention, discard, failed takes and orphan cleanup use `removeVideo`; account
deletion uses `deleteAccountFiles` for its whole folder. Storage has no React dependency.

Optional `stretches: [{ kind, startMs, endMs }]` use file-relative milliseconds and ordered, non-overlapping
`countdown` / `waiting` / `counting` / `paused` spans; earlier clips omit them.
