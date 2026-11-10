import { files, modules } from '@/workout/__fixtures__/session';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { videoFile } from './camcorder';
import { videosOf } from '@/storage/set-files';

vi.mock('expo-file-system', () => modules['expo-file-system']);

// Signed in as `local`; no database here.
vi.mock('@/storage/account', () => ({ userId: () => 'local' }));

afterEach(() => files.clear());

const dir = 'document/local/videos';

it("lists a set's videos in take order, keeping a gap a failed take left", () => {
  // Take 1 failed; take 10 sorts after 2 by number, not by name.
  for (const name of ['a-10', 'a-0', 'a-2', 'b-0', 'ab-0']) files.add(`${dir}/${name}.mp4`);

  expect(videosOf(['a', 'c'])).toEqual(
    new Map([['a', [`${dir}/a-0.mp4`, `${dir}/a-2.mp4`, `${dir}/a-10.mp4`]]]),
  );
});

it('leaves out a set whose take is still being written', () => {
  const take = videoFile('a', 1);
  files.add(`${dir}/a-0.mp4`);
  files.add(`${dir}/a-1.mp4`);
  expect(videosOf(['a'])).toEqual(new Map());

  take.finish(true);
  expect(videosOf(['a']).get('a')).toHaveLength(2);
});
