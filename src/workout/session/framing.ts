import type { BodyPart } from '@/exercises/registry';

import { framePhrase } from '@/workout/coach/phrase';

/** How long a differing out-of-frame reading must hold before it commits. */
const STABLE_MS = 1000;
export const NONE: readonly BodyPart[] = [];

/** Committed out-of-frame parts; `candidate` is a differing reading until it has held STABLE_MS. */
export type Framing = {
  missing: readonly BodyPart[];
  candidate: { parts: readonly BodyPart[]; since: number } | null;
};

const same = (a: readonly BodyPart[], b: readonly BodyPart[]) =>
  a.length === b.length && a.every((part, i) => part === b[i]);

/**
 * Debounces one frame's out-of-frame reading `parts` (null when not waiting: they only explain 'waiting')
 * into `missing`: on frame time `t`, so it doesn't flicker, a differing reading commits once it has held
 * STABLE_MS. `patch` is null when nothing changes, so `missing` keeps its reference; `phrase` is what to say.
 */
export function settle(
  { missing, candidate }: Framing,
  parts: readonly BodyPart[] | null,
  t: number,
): { patch: Partial<Framing> | null; phrase: string | null } {
  if (same(parts ?? NONE, missing))
    return { patch: candidate ? { candidate: null } : null, phrase: null };
  if (!parts) return { patch: { missing: NONE, candidate: null }, phrase: null };
  if (!candidate || !same(parts, candidate.parts))
    return { patch: { candidate: { parts, since: t } }, phrase: null };
  if (t - candidate.since < STABLE_MS) return { patch: null, phrase: null };
  return {
    patch: { missing: candidate.parts, candidate: null },
    phrase: framePhrase(candidate.parts),
  };
}
