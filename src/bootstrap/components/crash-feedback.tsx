import { useState } from 'react';

import { FeedbackSheet } from '@/components/feedback-sheet';
import { TextButton } from '@/components/text-button';

const WORDS = {
  kicker: 'SOMETHING BROKE',
  title: 'What were you doing?',
  lede: 'It goes with the error report, so we can find what broke.',
  placeholder: 'I tapped…',
};

/** The crash screen's Send feedback. Once sent the button thanks you: no toast shows over a failed app. */
export function CrashFeedback() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <>
      <TextButton
        wide
        label={sent ? 'Thanks for your feedback' : 'Send feedback'}
        disabled={sent}
        onPress={() => setOpen(true)}
      />
      <FeedbackSheet
        open={open}
        onClose={() => setOpen(false)}
        words={WORDS}
        note="The error report, app version and phone model go with it."
        draft={(message) => ({ source: 'crash', message, reaction: null, accuracy: null })}
        onSent={() => setSent(true)}
      />
    </>
  );
}
