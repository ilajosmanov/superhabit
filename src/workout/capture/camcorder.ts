import { fromCallback } from 'xstate';

import { removeVideo, reserveVideo } from '@/storage/set-files';

const jobs = new Map<string, Set<{ discarded: boolean }>>();

/** Tracks even a pending native start: Discard must also delete a file that appears later. */
export function videoFile(setId: string, index: number) {
  const reservation = reserveVideo(setId, index);
  const { file } = reservation;
  const job = { discarded: false };
  const pending = jobs.get(setId) ?? new Set();
  jobs.set(setId, pending);
  pending.add(job);
  return {
    file,
    get discarded() {
      return job.discarded;
    },
    discard() {
      job.discarded = true;
      removeVideo(file);
    },
    finish(ok: boolean) {
      if (!pending.delete(job)) return;
      if (!ok || job.discarded) removeVideo(file);
      reservation.release();
      if (pending.size === 0) jobs.delete(setId);
    },
  };
}

/** Marks pending native work before the store deletes a discarded set's files. */
export function discardVideoWrites(setIds: readonly string[]) {
  for (const setId of setIds) for (const job of jobs.get(setId) ?? []) job.discarded = true;
}

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
 * `rolling` lists a started or successfully finalized take; `taken` means final; `wrapped` means all are.
 */
export const camcorder = fromCallback<CamcorderEvent, CamcorderInput>(
  ({ input: { video, onTake }, receive, sendBack }) => {
    // CameraX records one file at a time, so each take starts once the previous file is final.
    // A take whose start never settles (the output is not bound) stalls the rest until `lost` gives it up.
    let previous = Promise.resolve();
    type Take = { cut(): void; abandon(): void; setId: string };
    let current: Take | undefined;
    const active = new Set<Take>();
    let lost = false;
    // Finished sets belong to the log; an unfinished/restarted set has no row to find on Discard.
    const unfinished = new Map<string, ReturnType<typeof videoFile>[]>();
    const discardUnfinished = () => {
      for (const pending of unfinished.values()) for (const job of pending) job.discard();
      unfinished.clear();
    };

    let set: string | null = null;
    let index = 0;
    let sample = (_timestampMs: number) => {};
    const take = (setId: string, takeIndex: number) => {
      type Stage =
        | 'queued'
        | 'creating'
        | 'starting'
        | 'rolling'
        | 'stopping'
        | 'done'
        | 'failed'
        | 'abandoned';
      let stage: Stage = 'queued';
      let samples: Float64Array | null = new Float64Array(128);
      let count = 0;
      let recording: Awaited<ReturnType<VideoOutput['createRecorder']>> | null = null;
      onTake({ type: 'takeStart', setId });
      sample = (timestampMs) => {
        const duration = recording?.recordedDuration ?? 0;
        if (!samples || !(duration > 0) || !Number.isFinite(duration)) return;
        if (count === samples.length) {
          const larger = new Float64Array(samples.length * 2);
          larger.set(samples);
          samples = larger;
        }
        samples[count++] = timestampMs - 1000 * duration;
      };
      const close = (ok: boolean) => {
        if (!samples) return;
        // Three positive samples let the median reject one bad sample.
        let anchorPoseMs: number | null = null;
        if (ok && count >= 3) {
          const sorted = samples.subarray(0, count).sort();
          const mid = Math.floor(count / 2);
          anchorPoseMs = count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
        samples = null;
        onTake({ type: 'takeEnd', setId, anchorPoseMs });
      };
      if (lost) return { setId, cut: () => close(false), abandon: () => close(false) };
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
      let finished = () => {};
      const final = new Promise<void>((resolve) => {
        finished = resolve;
      });
      const stopping = () => stage === 'stopping';
      const succeeded = () => stage === 'done';
      const terminal = () => succeeded() || stage === 'failed' || stage === 'abandoned';
      const settle = (ok: boolean) => {
        if (terminal()) {
          if (stage === 'abandoned') job.discard();
          return;
        }
        const wasStarted = recording !== null;
        close(ok);
        stage = ok ? 'done' : 'failed';
        job.finish(ok);
        active.delete(handle);
        if (wasStarted) sendBack({ type: 'taken', uri: job.file.uri, ok });
        finished();
      };
      const abandon = () => {
        if (terminal() || recording) return;
        settle(false);
        stage = 'abandoned';
      };
      const stop = () => {
        if (!recording) return;
        // A rejected stop means the take already ended; its callback still settles it.
        void recording
          .stopRecording()
          .catch((error) => console.warn('[camcorder] could not stop', error));
      };
      const cut = () => {
        if (terminal() || stage === 'stopping') return;
        close(!lost);
        if (stage === 'queued' || stage === 'creating') abandon();
        else {
          stage = 'stopping';
          stop();
        }
      };
      const start = async () => {
        if (!video || terminal()) return;
        try {
          stage = 'creating';
          const recorder = await video.createRecorder({
            filePath: job.file.uri.replace(/^file:\/\//, ''),
          });
          if (terminal() || job.discarded) {
            abandon();
            job.discard();
            return;
          }
          stage = 'starting';
          // Native may finalize before its start promise resolves; publish rolling before taken.
          const started = () => {
            if (recording) return;
            recording = recorder;
            sendBack({ type: 'rolling', setId, uri: job.file.uri });
          };
          let complete = (_ok: boolean) => {};
          const completion = new Promise<boolean>((resolve) => {
            complete = resolve;
          });
          void completion.then((ok) => {
            if (terminal()) {
              if (stage === 'abandoned') job.discard();
              return;
            }
            const beforeStart = !recording;
            if (ok) started();
            settle(ok);
            if (!ok && beforeStart) sendBack({ type: 'taken', uri: job.file.uri, ok: false });
          });
          await recorder.startRecording(
            () => complete(true),
            (error) => {
              console.warn('[camcorder] recording failed', error);
              complete(false);
            },
          );
          if (terminal()) {
            if (succeeded()) return;
            recording = recorder;
            stop();
            void completion.then(() => job.discard());
            return;
          }
          started();
          if (stopping()) stop();
          else stage = 'rolling';
        } catch (error) {
          console.warn('[camcorder] recording failed', error);
          settle(false);
        }
      };
      const handle = { setId, cut, abandon };
      active.add(handle);
      previous = previous.then(() => {
        void start();
        return final;
      });
      return handle;
    };
    const roll = (setId: string) => {
      current?.cut();
      if (!video) return;
      if (set !== setId) {
        discardUnfinished();
        set = setId;
        index = 0;
      }
      current = take(setId, index++);
    };

    receive((event) => {
      if (event.type === 'frame') sample(event.timestampMs);
      else if (event.type === 'logged') unfinished.delete(event.setId);
      else if (event.type === 'roll') roll(event.setId);
      else if (event.type === 'cut') current?.cut();
      else if (event.type === 'lost') {
        lost = true;
        current?.cut();
        for (const take of active) take.abandon();
      } else if (event.type === 'wrap') {
        current?.cut();
        void previous.then(() => sendBack({ type: 'wrapped' }));
      }
    });
    return () => {
      current?.cut();
      for (const take of active) if (unfinished.has(take.setId)) take.abandon();
      discardUnfinished();
    };
  },
);
