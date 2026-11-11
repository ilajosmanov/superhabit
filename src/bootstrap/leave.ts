import { createContext, useContext } from 'react';

/**
 * Leaving the account, from Profile. `signOut`: startup clears the phone (or keeps what's unsent, marked
 * signed out) and shows the sign-in screen. `deleted`: the server deleted it; startup clears the phone,
 * then shows the sign-in screen. `sessionEnded`: a call found the session gone (Profile, League); startup
 * shows the sign-in screen, which says so, and keeps everything for the same account.
 */
export const Leave = createContext<{
  signOut: () => void;
  deleted: () => void;
  sessionEnded: () => void;
}>({
  signOut: () => {},
  deleted: () => {},
  sessionEnded: () => {},
});

/** Profile's Sign out and Delete account, and Sign in again after the session ended. */
export const useLeave = () => useContext(Leave);
