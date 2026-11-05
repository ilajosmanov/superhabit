import * as Speech from 'expo-speech';
import { fromCallback } from 'xstate';

export type SayEvent = { type: 'say'; text: string };

/** Speaks each `say` event, cutting off the previous phrase; goes silent when the actor stops. */
export const speech = fromCallback<SayEvent>(({ receive }) => {
  receive(({ text }) => {
    // stop() first so speech never queues behind fast reps.
    void Speech.stop();
    Speech.speak(text, { language: 'en-US', rate: 1.1 });
  });
  return () => void Speech.stop();
});
