import { createContext, useContext } from 'react';

/** Signs you out: startup marks the account signed out and shows the sign-in screen. */
export const SignOut = createContext<() => void>(() => {});

/** Me's Sign out button. */
export const useSignOut = () => useContext(SignOut);
