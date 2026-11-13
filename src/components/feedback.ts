import * as Sentry from '@sentry/react-native';

export const REACTIONS = ['Bad', 'Okay', 'Good'] as const;
export type Reaction = (typeof REACTIONS)[number];
export type FeedbackSource = 'workout' | 'profile' | 'crash';

export type FeedbackDraft = {
  source: FeedbackSource;
  message: string;
  reaction: Reaction | null;
  accuracy: string | null;
  details?: Record<string, string>;
};

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

export function canSendFeedback(draft: FeedbackDraft): boolean {
  return draft.source === 'workout' ? draft.reaction !== null : draft.message.trim() !== '';
}

/** Only an explicit Send reaches here. Native Sentry queues delivery; JS can only detect capture failures. */
export function sendFeedback(draft: FeedbackDraft): boolean {
  if (!canSendFeedback(draft) || !Sentry.getClient()) return false;
  const message = [
    draft.source === 'workout' && `Tracking: ${draft.reaction}`,
    draft.source === 'workout' && draft.accuracy && `Accuracy: ${draft.accuracy}`,
    draft.message.trim(),
  ]
    .filter(Boolean)
    .join('\n\n');
  try {
    Sentry.captureFeedback(
      {
        message,
        ...(draft.source === 'crash' ? { associatedEventId: Sentry.lastEventId() } : {}),
      },
      {
        captureContext: {
          tags: {
            'feedback.source': draft.source,
            ...(draft.source === 'workout' && draft.reaction
              ? {
                  'feedback.tracking': draft.reaction,
                  'feedback.accuracy': draft.accuracy ?? 'Unanswered',
                }
              : {}),
          },
          ...(draft.details ? { contexts: { feedback: draft.details } } : {}),
        },
      },
    );
    return true;
  } catch {
    return false;
  }
}
