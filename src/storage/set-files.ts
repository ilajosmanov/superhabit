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

/** Reserves a file until native has finalized it; a set with a reserved file isn't playable yet. */
export function reserveVideo(setId: string, take: number) {
  const directory = videoFolder();
  directory.create({ intermediates: true, idempotent: true });
  const file = videoPath(setId, take);
  const token = {};
  const pending = writingVideos.get(setId) ?? new Set();
  writingVideos.set(setId, pending);
  pending.add(token);
  return {
    file,
    release() {
      pending.delete(token);
      if (pending.size === 0) writingVideos.delete(setId);
    },
  };
}

export function removeVideo(file: File) {
  try {
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('[camcorder] could not delete a recording', error);
  }
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

/**
 * Each of `setIds`' videos, as uris in take order. A failed take leaves a gap in the indices, so this lists
 * what exists rather than counting up. A set still filming or finalizing is left out: its file isn't
 * playable yet.
 */
// Lists the whole videos folder, once per day shown: retention keeps it to 30 days of videos.
export function videosOf(setIds: readonly string[]) {
  const ids = new Set(setIds.filter((setId) => !writingVideos.has(setId)));
  const videos = new Map<string, string[]>();
  if (ids.size === 0) return videos;
  const found = listVideos()
    .filter(({ setId }) => ids.has(setId))
    .sort((a, b) => a.take - b.take);
  for (const { setId, file } of found) videos.set(setId, [...(videos.get(setId) ?? []), file.uri]);
  return videos;
}

/** One failed video delete leaves the rest attempted. */
export function deleteVideos(setIds: readonly string[]) {
  if (setIds.length === 0) return;
  const ids = new Set(setIds);
  for (const { setId, file } of listVideos()) if (ids.has(setId)) removeVideo(file);
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
