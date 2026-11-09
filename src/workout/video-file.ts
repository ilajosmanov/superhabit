import { Directory, File, Paths } from 'expo-file-system';

import { userId } from '@/storage/account';
import { db } from '@/storage/database';
import { sets } from '@/storage/schema';

const folder = () => new Directory(Paths.document, userId(), 'videos');
const jobs = new Map<string, Set<{ discarded: boolean }>>();

function remove(file: File) {
  try {
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('[camcorder] could not delete a recording', error);
  }
}

/** Tracks even a pending native start: Discard must also delete a file that appears later. */
export function videoFile(setId: string, index: number) {
  const directory = folder();
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${setId}-${index}.mp4`);
  const job = { discarded: false };
  const pending = jobs.get(setId) ?? new Set();
  jobs.set(setId, pending);
  pending.add(job);
  let done = false;
  return {
    file,
    get discarded() {
      return job.discarded;
    },
    discard() {
      job.discarded = true;
      remove(file);
    },
    finish(ok: boolean) {
      if (done) return;
      done = true;
      if (!ok || job.discarded) remove(file);
      pending.delete(job);
      if (pending.size === 0) jobs.delete(setId);
    },
  };
}

/** Also used by recovery, without a running camcorder. One failed delete leaves the rest attempted. */
export function deleteVideos(setIds: readonly string[]) {
  if (setIds.length === 0) return;
  for (const setId of setIds) for (const job of jobs.get(setId) ?? []) job.discarded = true;
  const ids = new Set(setIds);
  removeVideos((setId) => ids.has(setId));
}

/** At startup only, before any session runs; open workouts' sets must keep their videos for Save. */
export function deleteOrphanVideos() {
  const ids = new Set(
    db()
      .select({ id: sets.id })
      .from(sets)
      .all()
      .map((row) => row.id),
  );
  removeVideos((setId) => !ids.has(setId));
}

/**
 * Each of `setIds`' videos, as uris in take order. A failed take leaves a gap in the indices, so this lists
 * what exists rather than counting up. A set still filming or finalizing is left out: its file isn't
 * playable yet.
 */
// shortcut: lists the whole videos folder, which grows until the 30-day prune lands; fine once per day shown.
export function videosOf(setIds: readonly string[]) {
  const ids = new Set(setIds.filter((setId) => !jobs.has(setId)));
  const videos = new Map<string, string[]>();
  if (ids.size === 0) return videos;
  const found = listVideos()
    .filter(({ setId }) => ids.has(setId))
    .sort((a, b) => a.take - b.take);
  for (const { setId, file } of found) videos.set(setId, [...(videos.get(setId) ?? []), file.uri]);
  return videos;
}

function removeVideos(matches: (setId: string) => boolean) {
  for (const { setId, file } of listVideos()) if (matches(setId)) remove(file);
}

/** The videos folder's `<setId>-<take>.mp4` files; none when it can't be read. */
function listVideos() {
  const directory = folder();
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
