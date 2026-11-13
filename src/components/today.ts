import { createContext, useContext } from 'react';

import { today, type Day } from '@/lib/day';

/** Today, as the startup machine keeps it: it turns at midnight and is read again when the app returns. */
export const Today = createContext<Day>(today());

/** Screens read today here, never with `today()` while rendering: then a page left open turns at midnight. */
export const useToday = () => useContext(Today);
