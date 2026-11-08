import type { StepResult } from './results';

/** A filmed set: where it sits among the session's results (`set`) and its files, in order. */
export type Clip = { set: number; result: StepResult; takes: readonly string[] };
/** A spot on the reel: a clip and one of its files. */
export type Spot = { clip: number; part: number };

/** The session as one video: every set that was filmed, in the order you did them. */
export const reelOf = (results: readonly StepResult[]): Clip[] =>
  results.flatMap((result, set) =>
    result.takes.length ? [{ set, result, takes: result.takes }] : [],
  );

/** How long a set ran, its segment's width on the bar; never 0, so every set stays visible. */
export const weight = ({ result }: Clip) => Math.max(1, result.endedAt - result.startedAt);

/** The file after `spot`, back to the first after the last. */
export function after(clips: readonly Clip[], { clip, part }: Spot): Spot {
  if (part + 1 < clips[clip].takes.length) return { clip, part: part + 1 };
  return { clip: (clip + 1) % clips.length, part: 0 };
}

/**
 * Where `x` (0 to 1 along the bar) falls: the clip whose segment is under it, the file within that clip,
 * and how far into that file, 0 to 1. A clip's files share its segment equally: the bar knows how long
 * each set ran, not each file.
 */
export function pointAt(clips: readonly Clip[], x: number): Spot & { into: number } {
  let left = Math.min(1, Math.max(0, x)) * clips.reduce((sum, clip) => sum + weight(clip), 0);
  for (const [i, clip] of clips.entries()) {
    const width = weight(clip);
    if (left <= width || i === clips.length - 1) {
      const along = Math.min(1, left / width) * clip.takes.length;
      const part = Math.min(clip.takes.length - 1, Math.floor(along));
      return { clip: i, part, into: along - part };
    }
    left -= width;
  }
  throw new Error('a reel has at least one clip');
}
