import { Directory, File, Paths } from 'expo-file-system';

import { userId } from './account';

export const traceFolder = () => new Directory(Paths.document, userId(), 'traces', 'pending');
const videoFolder = () => new Directory(Paths.document, userId(), 'videos');
export const traceTemp = (setId: string) => new File(traceFolder(), `${setId}.sht.tmp`);
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
// shortcut: lists the whole videos folder, which grows until the 30-day prune lands; fine once per day shown.
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

export function deleteTraces(setIds: readonly string[]) {
  for (const setId of setIds) {
    const file = new File(traceFolder(), `${setId}.sht`);
    if (file.exists) file.delete();
    const temp = traceTemp(setId);
    if (temp.exists) temp.delete();
  }
}

/** Sweep temporary files, leaving the caller's in-flight writes alone. */
export function sweepTraceTemps(writing: ReadonlyMap<string, unknown>) {
  try {
    const folder = traceFolder();
    if (!folder.exists) return;
    // A crash between write and rename leaves a temporary file with no reader.
    // shortcut: lists all of pending/ at every recorder start; move to app start if uploads lag and it grows.
    for (const file of folder.list())
      if (file.name.endsWith('.sht.tmp') && !writing.has(file.name.slice(0, -8)))
        new File(folder, file.name).delete();
  } catch (error) {
    console.warn('[recorder] could not sweep temporary files', error);
  }
}
