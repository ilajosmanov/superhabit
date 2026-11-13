import { Directory, File, Paths } from 'expo-file-system';

import { userId } from './account';

const traces = () => new Directory(Paths.document, userId(), 'traces');
/**
 * Where a set's trace is written, by the sharing in force when the set started: `pending/` waits to be
 * shared (and moves to `sent/`), `private/` never leaves the phone.
 */
export const traceFolder = (shared: boolean) =>
  new Directory(traces(), shared ? 'pending' : 'private');
export const sentFolder = () => new Directory(traces(), 'sent');
/** Files the server couldn't read: kept here, never offered again. */
export const unreadFolder = () => new Directory(traces(), 'unread');
const videoFolder = () => new Directory(Paths.document, userId(), 'videos');

/** Under this much free space a set is counted without filming, so the phone stays usable. */
const LOW_SPACE = 1024 ** 3;
export const roomToFilm = () => Paths.availableDiskSpace >= LOW_SPACE;
export const traceTemp = (setId: string, folder: Directory) => new File(folder, `${setId}.sht.tmp`);
const videoPath = (setId: string, take: number) => new File(videoFolder(), `${setId}-${take}.mp4`);

// File availability only: the capture owner keeps the native jobs and decides when to release them.
const writingVideos = new Map<string, Set<object>>();
const videoListeners = new Set<() => void>();
/** The folder as last listed, until a video is finalized or deleted (no database row changes then). */
let listed: { accountId: string; videos: ReadonlyMap<string, readonly string[]> } | null = null;

export function subscribeVideos(listener: () => void) {
  videoListeners.add(listener);
  return () => {
    videoListeners.delete(listener);
  };
}

function videosChanged() {
  listed = null;
  for (const listener of videoListeners) listener();
}

/** Reserves a file until native has finalized it; a set with a reserved file isn't playable yet. */
export function reserveVideo(setId: string, take: number) {
  const directory = videoFolder();
  directory.create({ intermediates: true, idempotent: true });
  const file = videoPath(setId, take);
  const token = {};
  const first = !writingVideos.has(setId);
  const pending = writingVideos.get(setId) ?? new Set();
  writingVideos.set(setId, pending);
  pending.add(token);
  // Hiding a set matters only if it was listed as playable (a retake).
  if (first && listed?.videos.has(setId)) videosChanged();
  return {
    file,
    release() {
      if (!pending.delete(token)) return;
      if (pending.size === 0) {
        writingVideos.delete(setId);
        videosChanged();
      }
    },
  };
}

/** Deletes one file; false when it wasn't there or couldn't be deleted. Tells nobody. */
function remove(file: File) {
  try {
    if (!file.exists) return false;
    file.delete();
    return true;
  } catch (error) {
    console.warn('[camcorder] could not delete a recording', error);
    return false;
  }
}

export function removeVideo(file: File) {
  if (remove(file)) videosChanged();
}

/** The videos folder's `<setId>-<take>.mp4` files; none when it can't be read. */
export function listVideos() {
  const directory = videoFolder();
  try {
    if (!directory.exists) return [];
    return directory.list().flatMap(({ name }) => {
      const match = /^(.*)-(\d+)\.mp4$/.exec(name);
      return match
        ? [{ setId: match[1], take: Number(match[2]), file: new File(directory, name) }]
        : [];
    });
  } catch (error) {
    // Best effort: a folder that can't be read must not stop the app from opening or a page from showing.
    console.warn('[videos] could not list videos', error);
    return [];
  }
}

/** All playable videos in take order. Pending sets stay hidden until their last native write releases. */
export function videoIndex(): ReadonlyMap<string, readonly string[]> {
  const videos = new Map<string, string[]>();
  const found = listVideos()
    .filter(({ setId }) => !writingVideos.has(setId))
    .sort((a, b) => a.take - b.take);
  for (const { setId, file } of found) {
    const takes = videos.get(setId) ?? [];
    takes.push(file.uri);
    videos.set(setId, takes);
  }
  return videos;
}

/** One failed video delete leaves the rest attempted. */
export function deleteVideos(setIds: readonly string[]) {
  if (setIds.length === 0) return;
  const ids = new Set(setIds);
  // Told once for the lot: each telling makes the shared index list the folder again.
  const gone = listVideos().filter(({ setId, file }) => ids.has(setId) && remove(file));
  if (gone.length > 0) videosChanged();
}

/**
 * `videoIndex()` for the kept account (`accountId`), listed once and shared until a video changes or
 * the account does. The same map comes back while nothing changed, so it works as an external store's
 * snapshot.
 */
export function sharedVideos(accountId: string) {
  if (listed?.accountId !== accountId) listed = { accountId, videos: videoIndex() };
  return listed.videos;
}

/** Delete an account's videos and traces together, before its database identity is cleared. */
export function deleteAccountFiles(accountId: string) {
  const folder = new Directory(Paths.document, accountId);
  if (folder.exists) {
    folder.delete();
    videosChanged();
  }
}

/** Discard removes every final and temporary copy, including pending uploads. */
export function deleteTraces(setIds: readonly string[]) {
  for (const setId of setIds) {
    for (const folder of [traceFolder(false), sentFolder(), unreadFolder(), traceFolder(true)]) {
      const file = new File(folder, `${setId}.sht`);
      if (file.exists) file.delete();
      const temp = traceTemp(setId, folder);
      if (temp.exists) temp.delete();
    }
  }
}

/** Sweep temporary files, leaving the caller's in-flight writes alone. */
export function sweepTraceTemps(writing: ReadonlyMap<string, unknown>) {
  try {
    for (const folder of [traceFolder(true), traceFolder(false)]) {
      if (!folder.exists) continue;
      // A crash between write and rename leaves a temporary file with no reader.
      // shortcut: lists the whole folder at every recorder start; move to app start if it grows large.
      for (const file of folder.list())
        if (file.name.endsWith('.sht.tmp') && !writing.has(file.name.slice(0, -8)))
          new File(folder, file.name).delete();
    }
  } catch (error) {
    console.warn('[recorder] could not sweep temporary files', error);
  }
}
