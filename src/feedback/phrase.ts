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
