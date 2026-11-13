import { files, modules } from '@/workout/__fixtures__/session';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { deleteVideos, sharedVideos, subscribeVideos } from '@/storage/set-files';
import { videoFile } from '@/workout/capture/camcorder';

vi.mock('expo-file-system', () => modules['expo-file-system']);
const account = vi.hoisted(() => ({ id: 'local' }));
vi.mock('@/storage/account', () => ({ userId: () => account.id }));

afterEach(() => {
  files.clear();
  account.id = 'local';
});

const folder = 'document/local/videos';

/** A take filmed and finalized the way the camcorder does it, so storage hears of the file. */
function film(setId: string, take: number, at = folder) {
  const video = videoFile(setId, take);
  files.add(`${at}/${setId}-${take}.mp4`);
  video.finish(true);
}

it('shows a saved set after its last take finishes finalizing, without changing set ids', () => {
  const first = videoFile('saved', 0);
  const last = videoFile('saved', 1);
  files.add(`${folder}/saved-0.mp4`);
  files.add(`${folder}/saved-1.mp4`);
  let current = sharedVideos('local');
  expect(current.has('saved')).toBe(false);
  const unsubscribe = subscribeVideos(() => {
    current = sharedVideos('local');
  });
  try {
    first.finish(true);
    expect(current.has('saved')).toBe(false);
    last.finish(true);
    expect(current.get('saved')).toEqual([`${folder}/saved-0.mp4`, `${folder}/saved-1.mp4`]);
  } finally {
    unsubscribe();
  }
});

it.each(['retention', 'discard'] as const)(
  'removes cached URLs when %s deletes a video without changing set ids',
  (reason) => {
    const take = videoFile('saved', 0);
    files.add(`${folder}/saved-0.mp4`);
    take.finish(true);
    const ids = ['saved'];
    let current = sharedVideos('local');
    expect(current.get('saved')).toEqual([`${folder}/saved-0.mp4`]);
    const unsubscribe = subscribeVideos(() => {
      current = sharedVideos('local');
    });
    try {
      if (reason === 'retention') deleteVideos(ids);
      else take.discard();
      expect(current.has('saved')).toBe(false);
    } finally {
      unsubscribe();
    }
  },
);

it('lists once for two consumers and repeated renders at an unchanged revision', () => {
  film('first', 0);
  film('second', 0);
  const scan = vi.spyOn(modules['expo-file-system'].Directory.prototype, 'list');
  const first = sharedVideos('local');
  const second = sharedVideos('local');
  const repeated = sharedVideos('local');
  expect(first.get('first')).toEqual([`${folder}/first-0.mp4`]);
  expect(second.get('second')).toEqual([`${folder}/second-0.mp4`]);
  expect(repeated.get('first')).toEqual([`${folder}/first-0.mp4`]);
  expect(scan).toHaveBeenCalledTimes(1);
});

it('drops the previous account index even when the availability revision is unchanged', () => {
  account.id = 'other';
  film('second', 0, 'document/other/videos');
  account.id = 'local';
  film('first', 0);
  expect(sharedVideos('local').has('first')).toBe(true);
  // No video changes between the two reads: only the account does.
  account.id = 'other';
  const next = sharedVideos('other');
  expect(next.has('first')).toBe(false);
  expect(next.get('second')).toEqual(['document/other/videos/second-0.mp4']);
});

it('hides a playable set while another take is being written, then publishes both takes', () => {
  film('saved', 0);
  let current = sharedVideos('local');
  const unsubscribe = subscribeVideos(() => {
    current = sharedVideos('local');
  });
  const next = videoFile('saved', 1);
  try {
    expect(current.has('saved')).toBe(false);
    files.add(`${folder}/saved-1.mp4`);
    next.finish(true);
    expect(current.get('saved')).toEqual([`${folder}/saved-0.mp4`, `${folder}/saved-1.mp4`]);
  } finally {
    next.finish(false);
    unsubscribe();
  }
});

it('lists the folder once more after a sweep deletes many videos', () => {
  for (const id of ['a', 'b', 'c']) film(id, 0);
  let current = sharedVideos('local');
  const unsubscribe = subscribeVideos(() => {
    current = sharedVideos('local');
  });
  const scan = vi.spyOn(modules['expo-file-system'].Directory.prototype, 'list');
  try {
    deleteVideos(['a', 'b', 'c']);
    expect(current.size).toBe(0);
    // One listing to find the files, one to refresh the index.
    expect(scan).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
  }
});
