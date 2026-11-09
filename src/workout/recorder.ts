import { Directory, File, Paths } from 'expo-file-system';
import type { PoseDetection } from 'superhabit-pose';
import { fromCallback } from 'xstate';

import { COUNTER_VERSIONS, type ExerciseId } from '@/exercises/registry';
import { toFrame } from '@/exercises/body/trace';
import { encodeTrace, type RecordedFrame, type TraceHeader } from '@/exercises/trace-file';

export type RecorderEvent =
  | { type: 'frame'; result: PoseDetection }
  | { type: 'save'; exercise: ExerciseId; counted: TraceHeader['counted'] }
  | { type: 'drop' }
  // The Done screen's "share movement data" switch: whether this session's traces are kept for sending.
  | { type: 'share'; on: boolean };

/** `on`: record at all; `share`: the session's, until the Done screen's switch says otherwise. */
type RecorderInput = { on: boolean; share: boolean };

/** The detector's usual pace. */
const NOMINAL_FPS = 15;
// shortcut: a set longer than ten minutes leaves no trace (its count would describe frames it lacks);
// stream to disk if longer sets matter.
const MAX_FRAMES = NOMINAL_FPS * 600;

// Each session's traces wait in their own cache folder. When the session stops, they move to
// documents/traces unless the Done screen's switch was turned off, which deletes them.
// They hold joint positions only, never video.
const pending = () => new Directory(Paths.cache, 'traces');
/** Session folders still writing or settling; a new session's sweep leaves them alone. */
const live = new Set<string>();
// Module-wide: two sessions in the same millisecond must not share a folder.
let sessions = 0;

// shortcut: a killed app's unshared traces stay in its private cache until the next workout's sweep (or
// Android clears the cache); sweep at app start too once something runs there.
/** Deletes folders no live session owns: what a killed app left behind. */
function sweep() {
  try {
    const root = pending();
    if (!root.exists) return;
    for (const folder of root.list()) if (!live.has(folder.name)) folder.delete();
  } catch (error) {
    console.warn('[recorder] could not delete old traces', error);
  }
}

/** After every write lands: shared traces move to documents, then the session folder goes. */
async function settle(folder: Directory, writes: readonly Promise<void>[], shared: boolean) {
  await Promise.all(writes);
  try {
    if (shared && folder.exists) {
      // shortcut: no backend yet, so kept traces stay in documents/traces; upload them once there is one.
      const kept = new Directory(Paths.document, 'traces');
      kept.create({ intermediates: true, idempotent: true });
      // Every move settles before the folder goes, so one failure cannot cut the others short.
      const moves = await Promise.allSettled(folder.list().map((file) => file.move(kept)));
      for (const move of moves)
        if (move.status === 'rejected')
          console.warn('[recorder] could not keep a trace', move.reason);
    }
  } catch (error) {
    console.warn('[recorder] could not keep traces', error);
  }
  try {
    if (folder.exists) folder.delete();
  } catch (error) {
    console.warn('[recorder] could not delete traces', error);
  }
  live.delete(folder.name);
}

/** Buffers one step's counting frames and saves each as a trace v2 (`.sht`) file when `record` is on. */
export const recorder = fromCallback<RecorderEvent, RecorderInput>(({ input, receive }) => {
  const { on, share } = input;
  if (!on) return;
  sweep();
  const id = `${Date.now()}-${sessions++}`;
  live.add(id);
  const folder = new Directory(pending(), id);
  const writes: Promise<void>[] = [];
  // The session's `share`, until the Done screen's switch changes it.
  let shared = share;
  let frames: RecordedFrame[] = [];
  let lastT = -1;
  let t0: number | null = null;
  const drop = () => {
    frames = [];
    lastT = -1;
    t0 = null;
  };

  receive((event) => {
    if (event.type === 'drop') {
      drop();
    } else if (event.type === 'share') {
      shared = event.on;
    } else if (event.type === 'frame') {
      t0 ??= event.result.timestampMs;
      const frame = toFrame(event.result, t0);
      if (frames.length < MAX_FRAMES && frame.t > lastT) {
        frames.push({ ...frame, phase: null, waiting: null, inferenceMs: null, brightness: null });
        lastT = frame.t;
      }
    } else {
      // At the cap the set ran on unrecorded.
      const full = frames.length >= MAX_FRAMES;
      if (frames.length === 0 || full) {
        if (full) console.info('[recorder] set too long to keep a trace');
        drop();
        return;
      }
      const setId = `${event.exercise}-${Date.now()}`;
      const name = `${setId}.sht`;
      const recorded = frames;
      drop();
      writes.push(
        (async () => {
          // shortcut: encoding blocks the JS thread at the set's end (tens of ms per thousand frames on
          // a desktop); step 2.4 rebuilds the recorder.
          const bytes = encodeTrace(
            {
              exercise: event.exercise,
              setId,
              counterVersion: COUNTER_VERSIONS[event.exercise],
              device: null,
              camera: null,
              takes: [],
              consent: [],
              counted: event.counted,
              labels: {},
            },
            recorded,
          );
          folder.create({ intermediates: true, idempotent: true });
          await new File(folder, name).write(bytes);
          console.info('[recorder] saved', name, recorded.length, 'frames', event.counted);
        })().catch((error) => console.warn('[recorder] could not write', error)),
      );
    }
  });
  // shortcut: a pause leaves a gap in one file (replay sees a tracking loss, as the counter's reset
  // does); split per segment if replay disagrees.
  return () => {
    drop();
    void settle(folder, writes, shared);
  };
});
