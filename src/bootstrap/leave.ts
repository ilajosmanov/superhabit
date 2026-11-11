import { createContext, useContext } from 'react';

/**
 * Leaving the account, from Me. `signOut`: startup marks it signed out and shows the sign-in screen.
 * `deleted`: the server deleted it; startup clears the phone, then shows the sign-in screen.
 */
export const Leave = createContext<{ signOut: () => void; deleted: () => void }>({
  signOut: () => {},
  deleted: () => {},
});

/** Me's Sign out and Delete account. */
export const useLeave = () => useContext(Leave);
