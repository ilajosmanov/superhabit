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
