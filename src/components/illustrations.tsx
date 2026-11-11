import {
  Canvas,
  Group,
  Path as SkiaPath,
  Skia,
  useClock,
  type SkPath,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { repAt } from './rep-loop';
import { colors } from '@/theme';

type FigureProps = {
  size?: number;
  color?: string;
  /** Stroke width on the 32 grid. */
  weight?: number;
};

/**
 * Our own pictures, drawn as 1.5px lines on a 32 grid: an exercise's figure, the surprise die and the empty
 * day. Icons
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

// Four cubics, not arcs: Skia turns an arc into conics whose weights hang on float noise, and a head drawn
// at another spot (the squat's) then stops blending with its other pose.
const ring = (x: number, y: number, r: number) => {
  const k = r * 0.5523;
  return `M${x - r} ${y}C${x - r} ${y - k} ${x - k} ${y - r} ${x} ${y - r}S${x + r} ${y - k} ${x + r} ${y}S${x + k} ${y + r} ${x} ${y + r}S${x - r} ${y + k} ${x - r} ${y}Z`;
};
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

const SAD =
  ring(18, 17.6, 2.6) +
  // Back, legs, the arm round the knees, floor; then the cloud and its rain.
  'M10.5 25.5Q8.5 17.5 15 16.2M10.5 25.5L22 20L23 26M14.6 17L16.5 21.6L22.3 21.9M5 26h22' +
  'M12.5 9.5h11a2.3 2.3 0 0 0 0-4.6a3 3 0 0 0-5.6-1.4a2.5 2.5 0 0 0-4.2 1.9a2.1 2.1 0 0 0-1.2 4.1Z' +
  'M15 11.5v1M18 12v1M21 11.5v1';
/** Someone hunched over their knees under a rain cloud: a day with no sets. */
export const SadFigure = (p: FigureProps) => <Figure d={SAD} {...p} />;

/**
 * The session's set-up, drawn wide (358 × 230): a phone leaning on the wall, its camera's view reaching
 * someone squatting. `off`: the camera is dark (no view, the lens struck through, everything dimmed).
 */
export function CameraScene({ width, off = false }: { width: number; off?: boolean }) {
  const ink = off ? colors.faint : colors.chalk;
  return (
    <Svg width={width} height={(width * 230) / 358} viewBox="0 0 358 230" pointerEvents="none">
      {!off && (
        <>
          <Path d="M28 70 321 149 28 210Z" fill={colors.accent} fillOpacity={0.07} />
          <Path
            d="M321 149 28 70M321 149 28 210"
            stroke={colors.accent}
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeDasharray="3 6"
            strokeLinecap="round"
          />
        </>
      )}
      <Path d="M10 210H348M330 30V210" stroke={colors.line} strokeWidth={2} strokeLinecap="round" />
      <Rect
        x={-10}
        y={-74}
        width={20}
        height={74}
        rx={5}
        transform="translate(298 209) rotate(25)"
        fill={colors.surface}
        stroke={ink}
        strokeWidth={2}
      />
      <Circle cx={321} cy={149} r={3.5} fill={off ? colors.faint : colors.accent} />
      {off && (
        <Path d="M300 128 342 170" stroke={colors.warn} strokeWidth={2} strokeLinecap="round" />
      )}
      <Path
        d={`${ring(16, 6, HEAD)}M15 9L12 17L21 18L20 26M14 11.5L24 12`}
        transform="translate(40 101) scale(4.2)"
        fill="none"
        stroke={ink}
        strokeWidth={0.48}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A stick figure: the head's centre and the body's lines (limbs, floor, wall). */
type Pose = { head: readonly [number, number]; body: string };
const HEAD = 2.6;

const SQUAT: Pose = { head: [16, 6], body: 'M15 9L12 17L21 18L20 26M14 11.5L24 12M6 26h20' };
const STANDING: Pose = {
  head: [17, 4],
  body: 'M16.5 7L16 16L17.5 21L17 26M16.2 9.5L24 11M6 26h20',
};
/**
 * Each exercise by id (this layer can't import the registry): `pose` is its figure; `rep`, when it moves,
 * is the other end of one rep, drawn with the same path commands so one morphs into the other; `mid`, when
 * a limb swings far, is the pose half-way, since a straight morph cuts the arc and shortens the limb.
 */
const EXERCISE = {
  squat: { pose: SQUAT, rep: STANDING },
  // The same movement, seen from the side.
  'side-squat': { pose: SQUAT, rep: STANDING },
  pushup: {
    pose: { head: [26, 12], body: 'M23 15L5 22M21 15.8L21.3 20.4L21.6 25M3 26h26' },
    rep: { head: [26.4, 19.8], body: 'M23 21.3L5 22.8M21 21.8L17.6 21.4L21.6 25M3 26h26' },
  },
  plank: { pose: { head: [27, 17], body: 'M24 19.5 4 22M21 20v6h5M3 26h26' } },
  situp: {
    pose: { head: [12, 9], body: 'M13 12L17 22L23 17L27 26M3 26h26' },
    rep: { head: [5.4, 23.2], body: 'M8.4 24L17 24.2L23 17L27 26M3 26h26' },
  },
  'glute-bridge': {
    pose: { head: [5, 22], body: 'M7.5 23L16 16L22 20L22 26M3 26h26' },
    rep: { head: [5, 22.6], body: 'M7.5 23.6L15 24L21 18.5L22 26M3 26h26' },
  },
  'jumping-jack': {
    pose: { head: [16, 5], body: 'M16 8L16 18M16 10L9 4M16 10L23 4M16 18L10 27M16 18L22 27' },
    rep: { head: [16, 5], body: 'M16 8L16 18M16 10L13 17M16 10L19 17M16 18L15 27M16 18L17 27' },
  },
  lunge: {
    pose: { head: [16, 5], body: 'M16 8L16 17M16 17L22 20L22 26M16 17L10 22L7 26M3 26h26' },
    rep: { head: [16, 3], body: 'M16 6L16 15M16 15L17.5 20.5L17 26M16 15L14.5 20.5L15 26M3 26h26' },
  },
  'wall-sit': {
    pose: { head: [11, 7], body: 'M11 10v7M11 17h9M20 17v9M11 12l5 3M7 4v22M7 26h19' },
  },
  'side-plank': { pose: { head: [6, 12], body: 'M8 15l19 10.5M9 16v10M11 16.5 13 8M3 26h26' } },
  // The leg swings 75° about the hip, so a straight morph would shrink it mid-way: `mid` keeps it on the arc.
  'leg-raise': {
    pose: { head: [5, 23], body: 'M8 24L17 24M17 24L20.4 13.5M3 26h26' },
    mid: { head: [5, 23], body: 'M8 24L17 24M17 24L26.1 17.8M3 26h26' },
    rep: { head: [5, 23], body: 'M8 24L17 24M17 24L28 24.6M3 26h26' },
  },
  burpee: {
    pose: { head: [16.5, 5], body: 'M16.5 8L17 26M16.4 9.5L16.8 14L17 18M3 26h26' },
    rep: { head: [26, 12], body: 'M23 15L5 22M21 15.8L21.3 20.4L21.6 25M3 26h26' },
  },
} satisfies Record<string, { pose: Pose; rep?: Pose; mid?: Pose }>;
type ExerciseKey = keyof typeof EXERCISE;

const still = ({ head: [x, y], body }: Pose) => ring(x, y, HEAD) + body;

export const ExerciseFigure = ({ exercise, ...p }: FigureProps & { exercise: ExerciseKey }) => (
  <Figure d={still(EXERCISE[exercise].pose)} {...p} />
);

/** Whether the exercise has a second pose, so `ExerciseMotion` can play it. */
export const moves = (exercise: ExerciseKey) => 'rep' in EXERCISE[exercise];

const PERIOD = 2600;

// Skia, not animated SVG props: Reanimated pushes animated SVG props through React Native's view tree
// every frame, and on a back swipe that tore the page's content down before the screen slid out (only the
// header left with it). A Skia canvas reads the shared value itself and never touches the tree, yet any
// running frame loop still does it now and then (3 swipes in 20), even when unmounted on blur: that is
// the same commit as the pop. So it plays only when asked.
/**
 * The figure doing one rep, over and over: a frame clock in a shared value, drawn by Skia on the UI
 * thread, no effect or timer. It ignores the reduced-motion setting: a caller that plays it unasked
 * (`Waiting`) shows `ExerciseFigure` instead when the phone asks for less motion.
 */
export function ExerciseMotion({ exercise, ...p }: FigureProps & { exercise: ExerciseKey }) {
  const figure = EXERCISE[exercise];
  // Both ends parse to the same verbs, so Skia can blend them point by point.
  const from = Skia.Path.MakeFromSVGString(still(figure.pose));
  const to = 'rep' in figure ? Skia.Path.MakeFromSVGString(still(figure.rep)) : null;
  const mid = 'mid' in figure ? Skia.Path.MakeFromSVGString(still(figure.mid)) : null;
  if (!from || !to) return <ExerciseFigure exercise={exercise} {...p} />;
  return <Moving from={from} to={to} mid={mid} {...p} />;
}

function Moving({
  from,
  to,
  mid,
  size = 24,
  color = colors.chalk,
  weight = 1.5,
}: FigureProps & { from: SkPath; to: SkPath; mid: SkPath | null }) {
  const clock = useClock();
  // `interpolate` weighs the path it is called on: 1 = itself, 0 = the argument.
  const path = useDerivedValue(() => {
    const t = repAt(clock.get(), PERIOD);
    if (!mid) return from.interpolate(to, 1 - t) ?? from;
    return (t < 0.5 ? from.interpolate(mid, 1 - 2 * t) : mid.interpolate(to, 2 - 2 * t)) ?? from;
  });
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale: size / 32 }]}>
        <SkiaPath
          path={path}
          style="stroke"
          color={color}
          strokeWidth={weight}
          strokeCap="round"
          strokeJoin="round"
        />
      </Group>
    </Canvas>
  );
}
