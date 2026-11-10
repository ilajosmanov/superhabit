import { createContext, useContext } from 'react';

/**
 * The id of the workout startup found left open at launch, or null. Its prompt offers it back, so a page
 * opened by a link at launch waits until the shared tables no longer show it open (Saved or Discarded),
 * rather than asking again or starting a session on a plan the Save is about to change.
 */
export const LeftOpen = createContext<string | null>(null);

export const useLeftOpen = () => useContext(LeftOpen);
