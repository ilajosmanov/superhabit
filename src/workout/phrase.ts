import type { BodyPart, Phase } from '@/exercises/registry';

/** What to say when counts change; null = stay silent (no change, or reset). */
export function repPhrase(
  prev: { reps: number; noReps: number },
  next: { reps: number; noReps: number },
  cues?: string[],
): string | null {
  if (next.reps > prev.reps)
    return next.reps % 5 === 0 ? `${next.reps}, keep going` : String(next.reps);
  if (next.noReps > prev.noReps) return cues?.[0] ?? 'Deeper';
  return null;
}

/**
 * Said on a set's last rep instead of repPhrase: the count, then what comes next.
 * `next.reps` Infinity = open-ended set, said without a number.
 */
export function setPhrase(
  reps: number,
  next: { reps: number; name: string; place: string } | null,
): string {
  if (!next) return `${reps}. Challenge done.`;
  const what = Number.isFinite(next.reps) ? `${next.reps} ${next.name}` : next.name;
  return `${reps}, set done. Next, ${what}. ${next.place}.`;
}

/** 'Go' as the counter first sees the start position; null otherwise. */
export const startPhrase = (prev: Phase, next: Phase) =>
  prev === 'waiting' && next === 'up' ? 'Go' : null;

/** Names the first part out of frame; null when all are in. */
export function framePhrase(missing: readonly BodyPart[]): string | null {
  const [part] = missing;
  return part ? `Your ${part} ${part === 'head' ? 'is' : 'are'} out of frame` : null;
}
