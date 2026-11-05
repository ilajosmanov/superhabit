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
