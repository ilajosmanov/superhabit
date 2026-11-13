import * as Sentry from '@sentry/react-native';
import { beforeEach, expect, it, vi } from 'vite-plus/test';

import { countAnswers, pickAccuracy, sendFeedback, type FeedbackDraft } from './feedback';

vi.mock('@sentry/react-native', () => ({
  getClient: vi.fn(() => ({})),
  lastEventId: vi.fn(() => 'previous-error'),
  captureFeedback: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const empty: FeedbackDraft = { source: 'workout', message: '', reaction: null, accuracy: null };

it('rejects an unanswered workout and whitespace-only general feedback without sending', () => {
  for (const draft of [empty, { ...empty, source: 'profile', message: ' \n ' } as const]) {
    expect(sendFeedback(draft)).toBe(false);
  }
  expect(Sentry.captureFeedback).not.toHaveBeenCalled();
});

it('accepts a reaction alone, independently of any previous error', () => {
  expect(sendFeedback({ ...empty, reaction: 'Good' })).toBe(true);
  expect(Sentry.captureFeedback).toHaveBeenCalledWith(
    { message: 'Tracking: Good' },
    expect.objectContaining({
      captureContext: expect.objectContaining({
        tags: {
          'feedback.source': 'workout',
          'feedback.tracking': 'Good',
          'feedback.accuracy': 'Unanswered',
        },
      }),
    }),
  );
  expect(Sentry.lastEventId).not.toHaveBeenCalled();
});

it('includes accuracy, comments and exercise context in workout feedback', () => {
  sendFeedback({
    ...empty,
    reaction: 'Bad',
    accuracy: 'Missed reps',
    message: '  It missed my squats.  ',
    details: { exercises: 'squat', finished: 'ended early' },
  });
  expect(Sentry.captureFeedback).toHaveBeenCalledWith(
    { message: 'Tracking: Bad\n\nAccuracy: Missed reps\n\nIt missed my squats.' },
    expect.objectContaining({
      captureContext: expect.objectContaining({
        tags: expect.objectContaining({ 'feedback.accuracy': 'Missed reps' }),
        contexts: { feedback: { exercises: 'squat', finished: 'ended early' } },
      }),
    }),
  );
});

it.each(['profile', 'crash'] as const)(
  'accepts free text from %s and links only crash feedback',
  (source) => {
    expect(sendFeedback({ ...empty, source, message: '  Please add lunges.  ' })).toBe(true);
    expect(Sentry.captureFeedback).toHaveBeenCalledWith(
      source === 'crash'
        ? { message: 'Please add lunges.', associatedEventId: 'previous-error' }
        : { message: 'Please add lunges.' },
      expect.anything(),
    );
  },
);

it('reports capture failure and allows the same draft to be retried', () => {
  vi.mocked(Sentry.captureFeedback).mockImplementationOnce(() => {
    throw new Error('capture failed');
  });
  const draft: FeedbackDraft = { ...empty, reaction: 'Okay' };
  expect(sendFeedback(draft)).toBe(false);
  expect(sendFeedback(draft)).toBe(true);
});

it('does not report success without an initialized Sentry client', () => {
  vi.mocked(Sentry.getClient).mockReturnValueOnce(undefined);
  expect(sendFeedback({ ...empty, reaction: 'Good' })).toBe(false);
  expect(Sentry.captureFeedback).not.toHaveBeenCalled();
});

it('combines count problems in chip order but keeps Right and Not sure on their own', () => {
  const answers = countAnswers(true, true);
  const pick = (picked: string[], answer: string) => pickAccuracy(answers, picked, answer);
  // Tapped holds-first, sent reps-first: either order is one answer.
  const both = pick(pick(['Right'], 'Time too short'), 'Missed reps');
  expect(both).toEqual(['Missed reps', 'Time too short']);
  expect(pick(both, 'Not sure')).toEqual(['Not sure']);
  expect(pick(both, 'Missed reps')).toEqual(['Time too short']);
});
