import { Directory, File, Paths } from 'expo-file-system';
import type { PoseDetection } from 'superhabit-pose';
import { fromCallback } from 'xstate';

import type { ExerciseId } from '@/exercises/registry';
import { toFrame, type Trace, type TraceFrame } from '@/exercises/trace';

export type RecorderEvent =
  | { type: 'frame'; result: PoseDetection }
  | { type: 'save'; exercise: ExerciseId; labels: Trace['labels'] }
  | { type: 'drop' }
  // The Done screen's "share movement data" switch: whether this session's traces are kept for sending.
  | { type: 'share'; on: boolean };

/** Written when a trace is too short to measure its rate: the detector's usual pace. */
const NOMINAL_FPS = 15;
// shortcut: a set longer than ten minutes leaves no trace (its labels would describe frames it lacks);
// stream to disk if longer sets matter.
const MAX_FRAMES = NOMINAL_FPS * 600;

// Each session's traces wait in their own cache folder. When the session stops, they move to
// documents/traces if you shared them and are deleted otherwise (Close, Back, leaving mid-set).
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

/** Buffers one step's counting frames and saves each as a Trace v1 file when `record` is on. */
export const recorder = fromCallback<RecorderEvent, boolean>(({ input: on, receive }) => {
  if (!on) return;
  sweep();
  const id = `${Date.now()}-${sessions++}`;
  live.add(id);
  const folder = new Directory(pending(), id);
  const writes: Promise<void>[] = [];
  let shared = false;
  let frames: TraceFrame[] = [];
  let t0: number | null = null;
  const drop = () => {
    frames = [];
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
      if (frames.length < MAX_FRAMES && frame.t > (frames.at(-1)?.t ?? -1)) frames.push(frame);
    } else {
      const last = frames.at(-1);
      // At the cap the set ran on unrecorded.
      const full = frames.length >= MAX_FRAMES;
      if (!last || full) {
        if (full) console.info('[recorder] set too long to keep a trace');
        drop();
        return;
      }
      const name = `${event.exercise}-${Date.now()}.json`;
      const trace: Trace = {
        version: 1,
        source: {
          dataset: 'superhabit-dev',
          clip: name,
          url: '',
          license: 'private recording, no redistribution',
        },
        exercise: event.exercise,
        labels: event.labels,
        // Pause gaps can round the average down to zero; Trace v1 requires a positive rate.
        fps:
          frames.length < 2
            ? NOMINAL_FPS
            : Math.max(1, Math.round((1000 * (frames.length - 1)) / last.t)),
        frames,
      };
      drop();
      writes.push(
        (async () => {
          folder.create({ intermediates: true, idempotent: true });
          await new File(folder, name).write(JSON.stringify(trace));
          console.info('[recorder] saved', name, trace.frames.length, 'frames', trace.labels);
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
