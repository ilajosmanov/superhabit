/**
 * Theme colors for props that take a value instead of a className (Skia, native config).
 * Mirrors the @theme block in global.css; theme.test.ts fails when they drift.
 */
export const colors = {
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
  warn: '#ff6a55',
} as const;

/** The primary amber key, lit from above: lighter top, darker lip. The style of a `bg-accent` view. */
export const lit = {
  backgroundImage:
    'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 55%, rgba(0,0,0,0.08) 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.14)',
} as const;
