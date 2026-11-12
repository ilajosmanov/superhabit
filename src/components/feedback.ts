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
