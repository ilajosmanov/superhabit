# capture

Recording each set. Storage owns paths and file operations; the workout store owns discard and startup
cleanup rules. Native jobs keep their cancellation and finalization here.

| File               | Holds                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| `recorder.ts`      | traces packed frame by frame, stretches, takes, device and camera metadata           |
| `recorder-file.ts` | paint scheduling, encoding, native gzip, temp-to-final rename and write cancellation |
| `camcorder.ts`     | the camera's takes, explicit take stages, pending native starts and finalization     |

Traces live at `documents/<userId()>/traces/<folder>/<setId>.sht`; gzip writes `.sht.tmp` before rename.
Consent at set start chooses `pending/` (waiting to be shared) or `private/` (never shared). Uploads move
pending traces to `sent/`, or `unread/` if the server cannot read them. The 30-day recording sweep removes
old saved sets' videos and traces in `private/`, `sent/` and `unread/`, keeping `pending/` uploads.
Videos live at `documents/<userId()>/videos/<setId>-<take>.mp4` (720p, silent). Every roll reserves an
index, including failures, so take indices keep gaps. Storage leaves sets with pending files out of
`videosOf` until the camcorder releases them.

The video anchor is the median of `pose timestampMs − 1000 × recordedDuration` from at least three
positive samples, closed at cut and kept in file time. A kept set's file jobs outlive its session.
`recorder.test.ts` covers traces and late-write cleanup through the real session; `camcorder.test.ts`
covers take-order listing, cut-during-start and teardown, alongside filming tests in `session/`.

Each take has one stage: queued → creating → starting → rolling → stopping → done, with failed and
abandoned exits and one settlement path. A cut before native start discards the take; a cut during start
waits for it, sends `rolling` with its `setId`, then stops and sends `taken`. Successful finalization also
settles a take whose native start never resolves, listing it with `rolling` before `taken` and releasing
its reservation. A logged take can finish after session
teardown; an unlogged stalled start is abandoned and releases its reservation, deleting any late file.
Trace windows include countdown, waiting and pauses; more than 9000 detector frames drops the trace.
