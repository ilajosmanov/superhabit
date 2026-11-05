import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';
import { repPhrase } from './phrase';

/** Speaks rep counts and no-rep cues as they change. */
export function useRepFeedback(reps: number, noReps: number, cues?: string[]) {
  const prev = useRef({ reps, noReps });
  const cue = cues?.[0];

  useEffect(() => {
    const text = repPhrase(prev.current, { reps, noReps }, cue === undefined ? undefined : [cue]);
    prev.current = { reps, noReps };
    if (!text) return;
    // stop() first so speech never queues behind fast reps.
    void Speech.stop();
    Speech.speak(text, { language: 'en-US', rate: 1.1 });
  }, [reps, noReps, cue]);

  useEffect(() => () => void Speech.stop(), []);
}
