/** Every way the count can be off for what the session had, all at once. The chip's words are what's sent. */
export function countAnswers(reps: boolean, holds: boolean): string[] {
  return [
    'Right',
    ...(reps ? ['Missed reps', 'Extra reps'] : []),
    ...(holds ? ['Time too short', 'Time too long'] : []),
    'Not sure',
  ];
}

/**
 * Problems combine; "Right" and "Not sure" stand alone. A second tap unpicks. The result keeps the
 * chips' order, not the taps', so one answer is always sent as one Sentry tag.
 */
export function pickAccuracy(answers: string[], picked: string[], answer: string): string[] {
  const alone = (a: string) => a === 'Right' || a === 'Not sure';
  const next = picked.includes(answer)
    ? picked.filter((a) => a !== answer)
    : alone(answer)
      ? [answer]
      : [...picked.filter((a) => !alone(a)), answer];
  return answers.filter((a) => next.includes(a));
}
