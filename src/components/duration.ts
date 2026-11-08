/** Whole seconds as minutes and seconds: 312 -> "5:12". */
export const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
