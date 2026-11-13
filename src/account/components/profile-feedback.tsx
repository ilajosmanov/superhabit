import { useState } from 'react';

import { FeedbackSheet } from '@/components/feedback-sheet';
import { TextButton } from '@/components/text-button';

const WORDS = {
  kicker: 'SHARE FEEDBACK',
  title: 'What should we make better?',
  lede: 'Something broken, missing or just right? Say it in your own words.',
  placeholder: 'I wish it…',
};

/** Profile's Share feedback: the form opened on purpose, any time. */
export function ProfileFeedback() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TextButton icon="chat_bubble" label="Share feedback" onPress={() => setOpen(true)} />
      <FeedbackSheet
        open={open}
        onClose={() => setOpen(false)}
        words={WORDS}
        note="Your app version and phone model go with it."
        draft={(message) => ({ source: 'profile', message, reaction: null, accuracy: null })}
      />
    </>
  );
}
