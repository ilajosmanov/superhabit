import { beforeEach, expect, it, vi } from 'vite-plus/test';

import { disk, phone } from './__fixtures__/file-system';
import { fileStore } from './file-store';

vi.mock('expo-file-system', () => import('./__fixtures__/file-system'));

// A list of words; broken JSON is unreadable. A new store is a new app start.
const start = () =>
  fileStore<string[]>('words', {
    empty: [],
    serialise: JSON.stringify,
    parse: (text) => {
      try {
        return { value: JSON.parse(text), complete: true };
      } catch {
        return { value: [], complete: false };
      }
    },
  });

beforeEach(() => {
  disk.clear();
  phone.full = false;
});

it('keeps what was set across app starts, in one file', () => {
  const store = start();
  expect(store.get()).toEqual([]);
  expect(store.set(['one'])).toBe(true);
  expect(store.set(['one', 'two'])).toBe(true);
  expect(start().get()).toEqual(['one', 'two']);
  expect([...disk.keys()]).toEqual(['words.json']);
});

it('keeps an unreadable file aside, once', () => {
  disk.set('words.json', '{"broken');
  vi.spyOn(Date, 'now').mockReturnValue(7);
  expect(start().get()).toEqual([]);
  expect(disk.get('words-7.unread.json')).toBe('{"broken');
  // The next start reads a clean file: nothing more is set aside.
  vi.spyOn(Date, 'now').mockReturnValue(8);
  expect(start().get()).toEqual([]);
  expect([...disk.keys()].sort()).toEqual(['words-7.unread.json', 'words.json']);
});

it('reads the new file when a crash came between deleting the old one and renaming', () => {
  start().set(['one']);
  disk.set('words.json.tmp', disk.get('words.json') ?? '');
  disk.delete('words.json');
  expect(start().get()).toEqual(['one']);
  // Back in place, so the next write's aside file isn't the only copy.
  expect([...disk.keys()]).toEqual(['words.json']);
});

it('changes nothing and says so when the phone is full', () => {
  const store = start();
  store.set(['one']);
  phone.full = true;
  expect(store.set(['one', 'two'])).toBe(false);
  expect(store.get()).toEqual(['one']);
  expect(disk.get('words.json')).toBe('["one"]');
});

it('still starts when an unreadable file cannot be set aside', () => {
  disk.set('words.json', '{"broken');
  phone.full = true;
  expect(start().get()).toEqual([]);
  expect(disk.get('words.json')).toBe('{"broken');
});
