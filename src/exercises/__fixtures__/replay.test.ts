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

it('lists only .sht files in sorted absolute paths without parsing them', () => {
  const root = mkdtempSync(join(tmpdir(), 'superhabit-trace-files-'));
  try {
    const directory = join(root, 'squat');
    mkdirSync(directory);
    // An invalid file still belongs in the eager listing; decoding happens during replay.
    writeFileSync(join(directory, 'z.sht'), 'not a trace');
    writeFileSync(join(directory, 'a.sht'), '');
    writeFileSync(join(directory, 'notes.txt'), '');
    writeFileSync(join(directory, 'clip.sht.bak'), '');
    mkdirSync(join(directory, 'nested.sht'));
    writeFileSync(join(directory, 'nested.sht', 'hidden.sht'), '');

    const files = traceFiles('squat', root);
    expect(files).toEqual([join(directory, 'a.sht'), join(directory, 'z.sht')]);
    expect(files.every((path) => isAbsolute(path))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
