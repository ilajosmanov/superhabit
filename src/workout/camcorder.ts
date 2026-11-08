import { Directory, File, Paths } from 'expo-file-system';
import { fromCallback } from 'xstate';

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
  }>;
};

/**
 * roll: start a new file; cut: stop it; wrap: stop and wait for every file;
 * share: keep every file in documents/videos when the session stops (the Done screen's movement-data switch);
 * lost: the camera dropped the output, so later rolls are no-ops and a take not started yet is given up.
 */
type CamcorderEvent =
  | { type: 'roll' }
  | { type: 'lost' }
  | { type: 'cut' }
  | { type: 'wrap' }
  | { type: 'share'; on: boolean };

const folder = () => new Directory(Paths.cache, 'reps');

/** Moves `files` to documents/videos; one failed move does not stop the rest. */
async function share(files: Iterable<File>) {
  try {
    // shortcut: no backend yet, so shared videos stay in documents/videos; upload them once there is one.
    const kept = new Directory(Paths.document, 'videos');
    kept.create({ intermediates: true, idempotent: true });
    const moves = await Promise.allSettled(
      [...files].filter((file) => file.exists).map(async (file) => file.move(kept)),
    );
    for (const move of moves)
      if (move.status === 'rejected')
        console.warn('[camcorder] could not keep a video', move.reason);
  } catch (error) {
    console.warn('[camcorder] could not keep videos', error);
  }
}

/** Deletes `files`; one failed delete does not stop the rest. */
function prune(files: Iterable<File | Directory>) {
  for (const file of files) {
    try {
      if (file.exists) file.delete();
    } catch (error) {
      console.warn('[camcorder] could not delete a recording', error);
    }
  }
}

// Module-wide: two sessions in the same millisecond must not share a file name (one prunes the other's).
let takes = 0;

/**
 * Films takes (video only) into the cache folder. Sends `rolling` once a take has really started,
 * `taken` once its file is final (`ok: false`: the encoder failed, the file is unusable) and `wrapped`
 * once every file of a `wrap` is final. Start failures only log: the take is simply not filmed.
 * Starts by deleting what an earlier session left behind; on stop it cuts the take and, once every file
 * is final, deletes this session's files, or moves them all to documents when shared.
 */
export const camcorder = fromCallback<CamcorderEvent, VideoOutput | undefined>(
  ({ input: video, receive, sendBack }) => {
    if (!video) return;
    if (folder().exists) prune(folder().list());
    const files = new Set<File>();
    // CameraX records one file at a time, so each take starts once the previous file is final.
    // A take whose start never settles (the output is not bound) stalls the rest until `lost` gives it up.
    let previous = Promise.resolve();
    let cut = () => {};
    // Kept unless the Done screen's switch turns it off; see ChallengeDone.
    let shared = true;
    let lost = false;
    let abandon = () => {};

    const roll = () => {
      cut();
      if (lost) return;
      const file = new File(folder(), `${Date.now()}-${takes++}.mp4`);
      files.add(file);
      let stopped = false;
      let stop = () => {};
      // Once only: VisionCamera rejects a second stopRecording, and the file is final only on its callback.
      cut = () => {
        if (stopped) return;
        stopped = true;
        stop();
      };
      previous = previous.then(
        () =>
          new Promise<void>((finished) => {
            const fail = (error: unknown) => {
              console.warn('[camcorder] recording failed', error);
              finished();
            };
            let abandoned = false;
            const taken = (ok: boolean) => {
              stopped = true; // the OS may finish a take early (backgrounding): nothing to stop
              // Given up by `lost`: wrap and cleanup already ran without it, so the late file is ours to delete.
              if (abandoned) return prune([file]);
              sendBack({ type: 'taken', uri: file.uri, ok });
              finished();
            };
            if (stopped) {
              finished();
              return;
            }
            abandon = () => {
              abandoned = true;
              finished();
            };
            video
              // VisionCamera takes a filesystem path, not a file:// URL.
              .createRecorder({ filePath: file.uri.replace(/^file:\/\//, '') })
              .then(async (recorder) => {
                if (stopped) {
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
      if (event.type === 'roll') roll();
      else if (event.type === 'cut') cut();
      else if (event.type === 'lost') {
        lost = true;
        cut();
        abandon();
      } else if (event.type === 'wrap') {
        cut();
        void previous.then(() => sendBack({ type: 'wrapped' }));
      } else {
        // Waits for the session to stop: the Done screen's switch comes after the wrap.
        shared = event.on;
      }
    });
    return () => {
      cut();
      // After every pending start and finalize, so a file that appears late is kept or deleted too.
      void previous.then(() => (shared ? share(files) : prune(files)));
    };
  },
);
