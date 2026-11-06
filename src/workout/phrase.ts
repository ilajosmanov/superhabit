import type { BodyPart, Phase } from '@/exercises/registry';

/** What to say when counts change; null = stay silent (no change, or reset). */
export function repPhrase(
  prev: { reps: number; noReps: number },
  next: { reps: number; noReps: number },
  cues?: readonly string[],
): string | null {
  if (next.reps > prev.reps)
    return next.reps % 5 === 0 ? `${next.reps}, keep going` : String(next.reps);
  if (next.noReps > prev.noReps) return cues?.[0] ?? 'Deeper';
  return null;
}

type Next = { rest: number | null } | { what: string; place: string | null };

/** Said at the end of an exercise step: the amount completed, then what comes next. */
export function setPhrase(done: string, next: Next | null): string {
  if (!next) return `${done}. Challenge done.`;
  if ('rest' in next)
    return next.rest === null
      ? `${done}, set done. Rest.`
      : `${done}, set done. Rest ${next.rest} seconds.`;
  if (next.place === null) return `${done}. Next, ${next.what}.`;
  return `${done}, set done. Next, ${next.what}. ${next.place}.`;
}

/** 'Go' as the counter first sees the start position; null otherwise. */
export const startPhrase = (prev: Phase, next: Phase) =>
  prev === 'waiting' && next !== 'waiting' ? 'Go' : null;

/** Names the first part out of frame; null when all are in. */
export function framePhrase(missing: readonly BodyPart[]): string | null {
  const [part] = missing;
  return part ? `Your ${part} ${part === 'head' ? 'is' : 'are'} out of frame` : null;
}
