import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

type FigureProps = {
  size?: number;
  color?: string;
  /** Stroke width on the 32 grid. */
  weight?: number;
};

/**
 * Our own pictures, drawn as 1.5px lines on a 32 grid: an exercise's figure and the surprise die. Icons
 * are Material Symbols (`Icon`); only what no icon set has is drawn here.
 * SVG, not Skia: a Skia canvas is its own GPU surface and blinks when a tab re-attaches.
 */
function Figure({ d, size = 24, color = colors.chalk, weight = 1.5 }: FigureProps & { d: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" pointerEvents="none">
      <Path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const ring = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const pip = (x: number, y: number) => ring(x, y, 0.55) + ring(x, y, 0.2);
const DIE =
  'M16 4 26.4 10v12L16 28 5.6 22V10ZM5.6 10 16 16l10.4-6M16 16v12' +
  [
    [16, 10],
    [8.5, 15],
    [13.1, 23],
    [23.8, 14.5],
    [21.2, 19],
    [18.6, 23.5],
  ]
    .map(([x, y]) => pip(x, y))
    .join('');
/** A die seen from its corner: one pip on top, two left, three right. */
export const DieFigure = (p: FigureProps) => <Figure d={DIE} {...p} />;

/** Each exercise as a stick figure, by exercise id (this layer can't import the registry). */
const EXERCISE = {
  squat:
    'M13.4 6a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M15 9l-3 8M12 17l9 1M21 18l-1 8M14 11.5l10 .5M6 26h20',
  pushup: 'M23.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M23 15L5 22M21 15.8l.6 9.2M3 26h26',
  plank: 'M24.4 17a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M24 19.5 4 22M21 20v6h5M3 26h26',
  situp: 'M9.4 9a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M13 12l4 10M17 22l6-5 4 9M3 26h26',
  'glute-bridge': 'M2.4 22a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M7.5 23 16 16l6 4v6M3 26h26',
  'jumping-jack':
    'M13.4 5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M16 8v10M16 10l-7-6M16 10l7-6M16 18l-6 9M16 18l6 9',
  lunge:
    'M13.4 5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M16 8v9M16 17l6 3v6M16 17l-6 5-3 4M3 26h26',
};
export const ExerciseFigure = ({
  exercise,
  ...p
}: FigureProps & { exercise: keyof typeof EXERCISE }) => <Figure d={EXERCISE[exercise]} {...p} />;
