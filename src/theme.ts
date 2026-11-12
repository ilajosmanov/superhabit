/**
 * The two palettes, for props that take a value instead of a className (Skia, Compose, native config).
 * They mirror global.css; theme.test.ts fails when they drift, or when a pair loses its contrast.
 * Components read the one in force with `useColors()` (`components/colors.tsx`); only what is always
 * dark (the camera, video) names `dark` itself.
 */
export const dark = {
  ground: '#0d0e0b',
  surface: '#181914',
  line: '#2e3028',
  edge: '#3a3c33',
  chalk: '#f2f0e8',
  soft: '#c9c8bc',
  muted: '#a3a396',
  subtle: '#8c8d80',
  faint: '#7a7b70',
  accent: '#f2b544',
  mark: '#f2b544',
  ink: '#0d0e0b',
  warn: '#ff6a55',
} as const;

export type Colors = Record<keyof typeof dark, string>;

/**
 * The same roles on paper: chalk and ground swap. Amber stays amber where it fills (`accent`); where it
 * is text, an icon or a focus ring (`mark`) it darkens until it reads. `ink` is the label on amber.
 */
export const light: Colors = {
  ground: '#f2f0e8',
  surface: '#fbfaf6',
  line: '#d9d6c9',
  edge: '#85867a',
  chalk: '#0d0e0b',
  soft: '#3a3c33',
  muted: '#55564b',
  subtle: '#5f6055',
  faint: '#6c6d62',
  accent: '#f2b544',
  mark: '#8a5700',
  ink: '#0d0e0b',
  warn: '#b3261e',
};

/** The primary amber key, lit from above: lighter top, darker lip. The style of a `bg-accent` view. */
export const lit = {
  backgroundImage:
    'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 55%, rgba(0,0,0,0.08) 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.14)',
} as const;

/** A Compose button's label (`@expo/ui` Text style): Geist medium, like Material's label large. */
export const COMPOSE_LABEL = { fontFamily: 'Geist', fontWeight: '500', fontSize: 15 } as const;
