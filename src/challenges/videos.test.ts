import { files, modules } from '@/workout/__fixtures__/session';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { deleteVideos, subscribeVideos, videoRevision } from '@/storage/set-files';
import { videoFile } from '@/workout/capture/camcorder';
import { videoSnapshot } from './videos';

vi.mock('expo-file-system', () => modules['expo-file-system']);
const account = vi.hoisted(() => ({ id: 'local' }));
vi.mock('@/storage/account', () => ({ userId: () => account.id }));

afterEach(() => {
  files.clear();
  account.id = 'local';
});

const folder = 'document/local/videos';

it('shows a saved set after its last take finishes finalizing, without changing set ids', () => {
  const first = videoFile('saved', 0);
  const last = videoFile('saved', 1);
  files.add(`${folder}/saved-0.mp4`);
  files.add(`${folder}/saved-1.mp4`);
  let current = videoSnapshot('local', videoRevision(), null);
  expect(current.videos.has('saved')).toBe(false);
  const unsubscribe = subscribeVideos(() => {
    current = videoSnapshot('local', videoRevision(), current);
  });
  try {
    first.finish(true);
    expect(current.videos.has('saved')).toBe(false);
    last.finish(true);
    expect(current.videos.get('saved')).toEqual([`${folder}/saved-0.mp4`, `${folder}/saved-1.mp4`]);
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
    let current = videoSnapshot('local', videoRevision(), null);
    expect(current.videos.get('saved')).toEqual([`${folder}/saved-0.mp4`]);
    const unsubscribe = subscribeVideos(() => {
      current = videoSnapshot('local', videoRevision(), current);
    });
    try {
      if (reason === 'retention') deleteVideos(ids);
      else take.discard();
      expect(current.videos.has('saved')).toBe(false);
    } finally {
      unsubscribe();
    }
  },
);

it('lists once for two consumers and repeated renders at an unchanged revision', () => {
  files.add(`${folder}/first-0.mp4`);
  files.add(`${folder}/second-0.mp4`);
  const scan = vi.spyOn(modules['expo-file-system'].Directory.prototype, 'list');
  const first = videoSnapshot('local', videoRevision(), null);
  const second = videoSnapshot('local', videoRevision(), first);
  const repeated = videoSnapshot('local', videoRevision(), second);
  expect(first.videos.get('first')).toEqual([`${folder}/first-0.mp4`]);
  expect(second.videos.get('second')).toEqual([`${folder}/second-0.mp4`]);
  expect(repeated.videos.get('first')).toEqual([`${folder}/first-0.mp4`]);
  expect(scan).toHaveBeenCalledTimes(1);
});

it('drops the previous account index even when the availability revision is unchanged', () => {
  files.add(`${folder}/first-0.mp4`);
  files.add('document/other/videos/second-0.mp4');
  const initial = videoSnapshot('local', videoRevision(), null);
  account.id = 'other';
  const next = videoSnapshot('other', videoRevision(), initial);
  expect(next.videos.has('first')).toBe(false);
  expect(next.videos.get('second')).toEqual(['document/other/videos/second-0.mp4']);
});

it('hides a playable set while another take is being written, then publishes both takes', () => {
  files.add(`${folder}/saved-0.mp4`);
  let current = videoSnapshot('local', videoRevision(), null);
  const unsubscribe = subscribeVideos(() => {
    current = videoSnapshot('local', videoRevision(), current);
  });
  const next = videoFile('saved', 1);
  try {
    expect(current.videos.has('saved')).toBe(false);
    files.add(`${folder}/saved-1.mp4`);
    next.finish(true);
    expect(current.videos.get('saved')).toEqual([`${folder}/saved-0.mp4`, `${folder}/saved-1.mp4`]);
  } finally {
    next.finish(false);
    unsubscribe();
  }
});
