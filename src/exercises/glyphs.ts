// Glyphs for exercises the app can't count yet, on the same 32 grid. Head = a 2.6 circle.
// Kept for when each exercise is tracked; sit-up, lunge, jack, bridge and climber already sit in their exercise files.
const head = (x: number, y: number) => `M${x - 2.6} ${y}a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0`;
export const UNTRACKED_GLYPHS = {
  pullup: `M4 4h24M11 4l3 8M21 4l-3 8${head(16, 10.5)}M16 14v9M16 23l-2 6M16 23l2 6`,
  dip: `M4 17h7M21 17h7M7 17v12M25 17v12M10 17l3-6M22 17l-3-6${head(16, 6)}M16 9v11M16 20l-2 7M16 20l2 7`,
  situp: `${head(12, 9)}M13 12l4 10M17 22l6-5 4 9M3 26h26`,
  lunge: `${head(16, 5)}M16 8v9M16 17l6 3v6M16 17l-6 5-3 4M3 26h26`,
  jack: `${head(16, 5)}M16 8v10M16 10l-7-6M16 10l7-6M16 18l-6 9M16 18l6 9`,
  burpee: `${head(16, 4)}M16 7v9M16 9l-5-6M16 9l5-6M16 16l-3 7M16 16l3 7M8 28h16`,
  bridge: `${head(5, 22)}M7.5 23 16 16l6 4v6M3 26h26`,
  climber: `${head(26, 12)}M23 15 6 21M15 18l-3 5M3 26h26`,
  wallsit: `M27 4v24${head(22, 6)}M22 9v9M22 18h-9M13 18v8M3 28h26`,
};
