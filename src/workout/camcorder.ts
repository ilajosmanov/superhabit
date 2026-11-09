import { fromCallback } from 'xstate';

import { videoFile } from './video-file';

/**
 * The part of VisionCamera's CameraVideoOutput (`useVideoOutput()`) the session uses; a CameraVideoOutput
 * is assignable to it, and tests pass a fake.
 */
export type VideoOutput = {
  createRecorder(settings: { filePath?: string }): Promise<{
    startRecording(
      onFinished: (filePath: string) => void,
      onError: (error: Error) => void,
    ): Promise<void>;
    stopRecording(): Promise<void>;
    readonly recordedDuration: number;
  }>;
};

export type TakeEvent =
  | { type: 'takeStart'; setId: string }
  | { type: 'takeEnd'; setId: string; anchorPoseMs: number | null };

type CamcorderEvent =
  /** Reserve the next take index and start filming once the previous file is final. */
  | { type: 'roll'; setId: string }
  /** Give up the video output, closing its clock and releasing a stalled start. */
  | { type: 'lost' }
  /** Close the take's clock now and stop its recording. */
  | { type: 'cut' }
  /** Cut and send wrapped once every queued file is final. */
  | { type: 'wrap' }
  /** Hand the finished set's files to the log, including retries of its write. */
  | { type: 'logged'; setId: string }
  /** Sample the current take's video clock at a pose timestamp. */
  | { type: 'frame'; timestampMs: number };

type CamcorderInput = {
  video: VideoOutput | undefined;
  /** Direct to the trace actor, so a cut reaches it before the set's save or next stage. */
  onTake: (event: TakeEvent) => void;
};

/**
 * Films directly into documents/<user>/videos/<setId>-<index>.mp4. Each roll reserves an index,
 * including failed starts. Takes serialize on CameraX finalization, but their clocks close at cut.
 * `rolling` means native start resolved; `taken` means its file is final; `wrapped` means all are.
 */
export const camcorder = fromCallback<CamcorderEvent, CamcorderInput>(
  ({ input: { video, onTake }, receive, sendBack }) => {
    // CameraX records one file at a time, so each take starts once the previous file is final.
    // A take whose start never settles (the output is not bound) stalls the rest until `lost` gives it up.
    let previous = Promise.resolve();
    let cut = () => {};
    let lost = false;
    let abandon = () => {};
    // Finished sets belong to the log; an unfinished/restarted set has no row to find on Discard.
    const unfinished = new Map<string, ReturnType<typeof videoFile>[]>();
    const discardUnfinished = () => {
      for (const pending of unfinished.values()) for (const job of pending) job.discard();
      unfinished.clear();
    };

    let set: string | null = null;
    let index = 0;
    let sample = (_timestampMs: number) => {};
    const roll = (setId: string) => {
      cut();
      if (!video) return;
      if (set !== setId) {
        discardUnfinished();
        set = setId;
        index = 0;
      }
      const takeIndex = index++;
      onTake({ type: 'takeStart', setId });
      // Only numbers per frame; grow geometrically, sort once at the cut.
      let samples = new Float64Array(128);
      let count = 0;
      let recording: { readonly recordedDuration: number } | null = null;
      sample = (timestampMs) => {
        const duration = recording?.recordedDuration ?? 0;
        if (!(duration > 0) || !Number.isFinite(duration)) return;
        if (count === samples.length) {
          const larger = new Float64Array(samples.length * 2);
          larger.set(samples);
          samples = larger;
        }
        samples[count++] = timestampMs - 1000 * duration;
      };
      let closed = false;
      const close = (ok: boolean) => {
        if (closed) return;
        closed = true;
        sample = () => {};
        // Three positive samples let the median reject one bad sample; zero means no written sample yet.
        let anchorPoseMs: number | null = null;
        if (ok && count >= 3) {
          const sorted = samples.subarray(0, count).sort();
          const mid = Math.floor(count / 2);
          anchorPoseMs = count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
        onTake({ type: 'takeEnd', setId, anchorPoseMs });
        samples = new Float64Array(0);
        recording = null;
      };
      cut = () => close(false);
      if (lost) return;
      let job: ReturnType<typeof videoFile>;
      try {
        job = videoFile(setId, takeIndex);
      } catch (error) {
        close(false);
        console.warn('[camcorder] recording failed', error);
        return;
      }
      const pending = unfinished.get(setId) ?? [];
      pending.push(job);
      unfinished.set(setId, pending);
      const { file } = job;
      let stopped = false;
      let stop = () => {};
      // Once only: VisionCamera rejects a second stopRecording, and the file is final only on its callback.
      cut = () => {
        if (stopped) return;
        stopped = true;
        close(!lost);
        stop();
      };
      previous = previous.then(
        () =>
          new Promise<void>((finished) => {
            const fail = (error: unknown) => {
              close(false);
              job.finish(false);
              console.warn('[camcorder] recording failed', error);
              finished();
            };
            let abandoned = false;
            const taken = (ok: boolean) => {
              stopped = true; // the OS may finish a take early (backgrounding): nothing to stop
              // Given up by `lost`: wrap and cleanup already ran without it, so the late file is ours to delete.
              if (abandoned) return job.discard();
              close(ok);
              job.finish(ok);
              sendBack({ type: 'taken', uri: file.uri, ok });
              finished();
            };
            if (stopped || job.discarded) {
              close(false);
              job.finish(false);
              finished();
              return;
            }
            abandon = () => {
              abandoned = true;
              job.discard();
              job.finish(false);
              finished();
            };
            video
              // VisionCamera takes a filesystem path, not a file:// URL.
              .createRecorder({ filePath: file.uri.replace(/^file:\/\//, '') })
              .then(async (recorder) => {
                if (stopped || job.discarded) {
                  close(false);
                  job.finish(false);
                  finished();
                  return;
                }
                await recorder.startRecording(
                  () => taken(true),
                  (error) => {
                    console.warn('[camcorder] recording failed', error);
                    taken(false);
                  },
                );
                abandon = () => {};
                if (!closed) recording = recorder;
                // A rejected stop means the take already ended; its callback still settles it.
                stop = () =>
                  void recorder
                    .stopRecording()
                    .catch((error) => console.warn('[camcorder] could not stop', error));
                if (stopped) stop();
                else sendBack({ type: 'rolling', uri: file.uri });
              })
              .catch(fail);
          }),
      );
    };

    receive((event) => {
      if (event.type === 'frame') sample(event.timestampMs);
      else if (event.type === 'logged') unfinished.delete(event.setId);
      else if (event.type === 'roll') roll(event.setId);
      else if (event.type === 'cut') cut();
      else if (event.type === 'lost') {
        lost = true;
        cut();
        abandon();
      } else if (event.type === 'wrap') {
        cut();
        void previous.then(() => sendBack({ type: 'wrapped' }));
      }
    });
    return () => {
      cut();
      discardUnfinished();
    };
  },
);
