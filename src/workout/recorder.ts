import { Directory, File, Paths } from 'expo-file-system';
import type { PoseDetection } from 'superhabit-pose';
import { fromCallback } from 'xstate';

import type { ExerciseId } from '@/exercises/registry';
import { toFrame, type Trace, type TraceFrame } from '@/exercises/trace';

export type RecorderEvent =
  | { type: 'frame'; result: PoseDetection }
  | { type: 'save'; exercise: ExerciseId; labels: Trace['labels'] }
  | { type: 'drop' };

/** Buffers one step's counting frames; saves Trace v1 files only when enabled by the dev route. */
export const recorder = fromCallback<RecorderEvent, boolean>(({ input: on, receive }) => {
  if (!on) return;
  // shortcut: unbounded buffer; cap it if long holds run out of memory.
  let frames: TraceFrame[] = [];
  let t0: number | null = null;
  const drop = () => {
    frames = [];
    t0 = null;
  };

  receive((event) => {
    if (event.type === 'drop') {
      drop();
    } else if (event.type === 'frame') {
      t0 ??= event.result.timestampMs;
      const frame = toFrame(event.result, t0);
      if (frame.t > (frames.at(-1)?.t ?? -1)) frames.push(frame);
    } else {
      const last = frames.at(-1);
      if (!last) return;
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
          frames.length < 2 ? 15 : Math.max(1, Math.round((1000 * (frames.length - 1)) / last.t)),
        frames,
      };
      drop();
      try {
        const dir = new Directory(Paths.document, 'traces');
        dir.create({ intermediates: true, idempotent: true });
        void new File(dir, name)
          .write(JSON.stringify(trace))
          .catch((error) => console.warn('[recorder] could not write', error));
      } catch (error) {
        console.warn('[recorder] could not write', error);
      }
    }
  });
  // shortcut: a pause leaves a gap in one file (replay sees a tracking loss, as the counter's reset
  // does); split per segment if replay disagrees.
  return drop;
});
