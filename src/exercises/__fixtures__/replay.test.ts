import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { expect, it, vi } from 'vite-plus/test';

import { traceFiles } from './replay';

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    // Force unsorted enumeration regardless of the filesystem's native ordering.
    readdirSync: (directory: string, options: { withFileTypes: true }) =>
      fs.readdirSync(directory, options).sort((a, b) => b.name.localeCompare(a.name)),
  };
});

it('lists only JSON files in sorted absolute paths without parsing them', () => {
  const root = mkdtempSync(join(tmpdir(), 'superhabit-trace-files-'));
  try {
    const directory = join(root, 'squat');
    mkdirSync(directory);
    // Invalid JSON still belongs in the eager listing; parsing happens during replay.
    writeFileSync(join(directory, 'z.json'), 'invalid JSON');
    writeFileSync(join(directory, 'a.json'), '');
    writeFileSync(join(directory, 'notes.txt'), '');
    writeFileSync(join(directory, 'clip.json.bak'), '');
    mkdirSync(join(directory, 'nested.json'));
    writeFileSync(join(directory, 'nested.json', 'hidden.json'), '');

    const files = traceFiles('squat', root);
    expect(files).toEqual([join(directory, 'a.json'), join(directory, 'z.json')]);
    expect(files.every((path) => isAbsolute(path))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
