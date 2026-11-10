import { createContext, useContext } from 'react';

/**
 * The workout startup found left open at launch (`id`, or null), and whether its prompt is still deciding
 * it. A page opened by a link at launch waits while it decides, then skips it rather than asking again
 * (the shared tables may lag the Save or Discard by a moment).
 */
export const LeftOpen = createContext<{ id: string | null; deciding: boolean }>({
  id: null,
  deciding: false,
});

export const useLeftOpen = () => useContext(LeftOpen);
