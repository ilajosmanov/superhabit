# capture

Recording each set. Storage owns paths and file operations; the workout store owns discard and startup
cleanup rules. Native jobs keep their cancellation and finalization here.

| File               | Holds                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| `recorder.ts`      | traces packed frame by frame, stretches, takes, device and camera metadata           |
| `recorder-file.ts` | paint scheduling, encoding, native gzip, temp-to-final rename and write cancellation |
| `camcorder.ts`     | the camera's takes, pending native starts, discard flags and finalization            |

Traces live at `documents/<userId()>/traces/pending/<setId>.sht`; gzip writes `.sht.tmp` before rename.
Videos live at `documents/<userId()>/videos/<setId>-<take>.mp4` (720p, silent). Every roll reserves an
index, including failures, so take indices keep gaps. Storage leaves sets with pending files out of
`videosOf` until the camcorder releases them.

The video anchor is the median of `pose timestampMs − 1000 × recordedDuration` from at least three
positive samples, closed at cut and kept in file time. A kept set's file jobs outlive its session.
`recorder.test.ts` covers traces and late-write cleanup through the real session; `camcorder.test.ts`
covers take-order listing and availability, alongside filming tests in `session/`.
