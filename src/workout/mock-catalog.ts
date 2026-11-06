import { EXERCISES } from '@/exercises/registry';

/** One line on a challenge card: the step's goal in its own unit ("×25", "60 s", "MAX ×2"). */
export type CatalogStep = { glyph: string; name: string; goal: string };
export type CatalogEntry = {
  /** A CHALLENGES route id when the challenge can already run; the others are display-only. */
  id: string;
  name: string;
  days: number;
  steps: readonly CatalogStep[];
  /** Rounds and rest: not steps you do, so one label under the lines. */
  note?: string;
};

// Glyphs for exercises the app can't count yet, on the same 32 grid. Head = a 2.6 circle.
const head = (x: number, y: number) => `M${x - 2.6} ${y}a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0`;
// Body flat and low on the forearms, so it doesn't read as the push-up's slanted body on straight arms.
const PLANK = `${head(27, 17)}M24 19.5 4 22M21 20v6h5M3 26h26`;
const PULLUP = `M4 4h24M11 4l3 8M21 4l-3 8${head(16, 10.5)}M16 14v9M16 23l-2 6M16 23l2 6`;
const DIP = `M4 17h7M21 17h7M7 17v12M25 17v12M10 17l3-6M22 17l-3-6${head(16, 6)}M16 9v11M16 20l-2 7M16 20l2 7`;
const SITUP = `${head(12, 9)}M13 12l4 10M17 22l6-5 4 9M3 26h26`;
const LUNGE = `${head(16, 5)}M16 8v9M16 17l6 3v6M16 17l-6 5-3 4M3 26h26`;
const JACK = `${head(16, 5)}M16 8v10M16 10l-7-6M16 10l7-6M16 18l-6 9M16 18l6 9`;
const BURPEE = `${head(16, 4)}M16 7v9M16 9l-5-6M16 9l5-6M16 16l-3 7M16 16l3 7M8 28h16`;
const BRIDGE = `${head(5, 22)}M7.5 23 16 16l6 4v6M3 26h26`;
const CLIMBER = `${head(26, 12)}M23 15 6 21M15 18l-3 5M3 26h26`;
const WALLSIT = `M27 4v24${head(22, 6)}M22 9v9M22 18h-9M13 18v8M3 28h26`;

const step = (glyph: string, name: string) => (goal: string) => ({ glyph, name, goal });
const squats = step(EXERCISES.squat.glyph, 'Squats');
const pushups = step(EXERCISES.pushup.glyph, 'Push-ups');
const plank = step(PLANK, 'Plank');

// shortcut: examples from the "Superhabit primitives" doc plus stress cases, ready to display;
// replace with the data layer.
export const MOCK_CATALOG: readonly CatalogEntry[] = [
  {
    id: 'squat-pushup',
    name: 'Squats + push-ups',
    days: 30,
    steps: [squats('×25'), pushups('×25')],
  },
  { id: 'plank-minute', name: 'Plank minute', days: 21, steps: [plank('60 s')] },
  {
    id: 'floor-circuit',
    name: 'Floor circuit',
    days: 30,
    steps: [pushups('×10'), plank('30 s')],
    note: '3 ROUNDS · 30 S REST',
  },
  {
    id: 'two-max-sets',
    name: 'Two max sets',
    days: 14,
    steps: [squats('MAX ×2')],
    note: '60 S REST',
  },
  { id: 'squat-hundred', name: 'Squat hundred', days: 21, steps: [squats('×100')] },
  { id: 'pushup-fifty', name: 'Push-up fifty', days: 21, steps: [pushups('×50')] },
  // Stress case: twelve exercises in one challenge.
  {
    id: 'full-body-dozen',
    name: 'Full body dozen',
    days: 45,
    steps: [
      step(JACK, 'Jumping jacks')('×30'),
      squats('×20'),
      pushups('×15'),
      step(LUNGE, 'Lunges')('×10 each'),
      plank('45 s'),
      step(SITUP, 'Sit-ups')('×20'),
      step(BRIDGE, 'Glute bridges')('×15'),
      step(CLIMBER, 'Mountain climbers')('×20 each'),
      step(PULLUP, 'Pull-ups')('×5'),
      step(DIP, 'Dips')('×8'),
      step(WALLSIT, 'Wall sit')('40 s'),
      step(BURPEE, 'Burpees')('MAX'),
    ],
    note: '2 ROUNDS · 45 S REST',
  },
];

export const catalogEntry = (id: string) => MOCK_CATALOG.find((entry) => entry.id === id);
