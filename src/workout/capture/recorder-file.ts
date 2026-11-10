import { writeGzip } from 'superhabit-gzip-file';

import { sweepTraceTemps, traceFolder, traceTemp } from '@/storage/set-files';
import type { TraceBuilder, TraceInfo } from '@/storage/trace-file';

const jobs = new Map<string, { discarded: boolean }>();

export const sweepTraceWrites = () => sweepTraceTemps(jobs);

/** Discard also cancels a finished set's write if it has not landed yet. */
export function discardTraceWrites(setIds: readonly string[]) {
  for (const setId of setIds) {
    const job = jobs.get(setId);
    if (job) job.discarded = true;
  }
}

/**
 * Lets the between-sets view paint, finishes the packed trace, then gzips and writes it natively off the
 * JS thread. A kept set's job outlives its session.
 */
export async function writeTrace(info: TraceInfo, trace: TraceBuilder) {
  const job = { discarded: false };
  jobs.set(info.setId, job);
  try {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (job.discarded) return;
    // shortcut: one quantizing pass over the set still runs on Hermes after paint, and backgrounding
    // delays it until return; persist earlier if killed background jobs matter.
    const start = performance.now();
    const bytes = trace.bytes(info);
    console.info('[recorder] encode ms', performance.now() - start, info.setId, trace.frames);
    const folder = traceFolder();
    folder.create({ intermediates: true, idempotent: true });
    const temp = traceTemp(info.setId);
    const write = performance.now();
    await writeGzip(bytes.buffer, temp.uri);
    console.info('[recorder] write ms', performance.now() - write, info.setId, bytes.length);
    if (job.discarded) {
      if (temp.exists) temp.delete();
      return;
    }
    // shortcut: no fsync, a power cut right after the rename can leave an empty file; fsync if pulled traces ever show one.
    temp.rename(`${info.setId}.sht`);
    console.info('[recorder] saved', info.setId, trace.frames, 'frames', info.counted);
  } catch (error) {
    console.warn('[recorder] could not write', error);
  } finally {
    jobs.delete(info.setId);
  }
}
