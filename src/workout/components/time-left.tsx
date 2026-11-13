import { Canvas, Path, Skia, useClock, type SkPath } from '@shopify/react-native-skia';
import { Suspense, use, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { displayCorners, type Corners } from 'superhabit-display-corners';

import { dark as colors } from '@/theme';

/**
 * Time left as an amber line over a faint track: it runs back toward its start and is gone after
 * `totalS`. `leftS` is where it stands when it mounts (read once: the line moves on its own after that,
 * from a Skia frame clock on the UI thread, so the second-by-second ticks never re-render it). Key it
 * by the step, so a new countdown or rest starts full.
 */
function Drain({
  path,
  totalS,
  leftS,
  width,
  height,
  stroke,
}: {
  path: SkPath;
  totalS: number;
  leftS: number;
  width: number;
  height: number;
  stroke: number;
}) {
  const [startS] = useState(leftS);
  const clock = useClock();
  const end = useDerivedValue(() => Math.max(0, startS - clock.get() / 1000) / totalS);
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Path path={path} style="stroke" strokeWidth={stroke} color={colors.chalk} opacity={0.16} />
      <Path
        path={path}
        style="stroke"
        strokeWidth={stroke}
        strokeCap="round"
        color={colors.accent}
        end={end}
      />
    </Canvas>
  );
}

type Clock = { totalS: number; leftS: number };

const EDGE_INSET = 5;

/** Board 18b: the screen's own edge is the countdown, drawn round the display's corners. */
export function EdgeClock(props: Clock) {
  // Read once per countdown (it is keyed by the set): a 180° turn keeps the window's size but swaps
  // its corners. Held here, outside the Suspense, so a suspended first render doesn't read again.
  // shortcut: a turn during one countdown keeps its old corners; listen for orientation if a phone with
  // uneven top and bottom corners shows it.
  const [read] = useState(displayCorners);
  // The read takes a frame; the edge waits for it rather than redrawing its corners.
  return (
    <Suspense fallback={null}>
      <Edge read={read} {...props} />
    </Suspense>
  );
}

function Edge({ read, ...props }: Clock & { read: Promise<Corners | null> }) {
  const { width, height } = useWindowDimensions();
  const corners = use(read);
  // Concentric with the glass; 30 where the system doesn't report its corners.
  const at = (display: number | undefined) => {
    const r = display === undefined ? 30 : Math.max(0, display - EDGE_INSET);
    return { x: r, y: r };
  };
  const path = Skia.PathBuilder.Make()
    .addRRect({
      rect: Skia.XYWHRect(EDGE_INSET, EDGE_INSET, width - 2 * EDGE_INSET, height - 2 * EDGE_INSET),
      topLeft: at(corners?.topLeft),
      topRight: at(corners?.topRight),
      bottomRight: at(corners?.bottomRight),
      bottomLeft: at(corners?.bottomLeft),
    })
    .detach();
  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Drain path={path} width={width} height={height} stroke={8} {...props} />
    </View>
  );
}

/** Board 19b: a ring from twelve o'clock; `children` sit in its middle. */
export function RingClock({
  size,
  children,
  ...props
}: Clock & { size: number; children: ReactNode }) {
  // Not quite 360°: a full turn collapses to nothing.
  const path = Skia.PathBuilder.Make()
    .addArc(Skia.XYWHRect(6, 6, size - 12, size - 12), -90, 359.9)
    .detach();
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <View className="absolute inset-1.5 rounded-full bg-ground/55" />
      <View className="absolute inset-0">
        <Drain path={path} width={size} height={size} stroke={12} {...props} />
      </View>
      {children}
    </View>
  );
}

/** Board 19a: a bar that drains to the left. */
export function BarClock({ width, ...props }: Clock & { width: number }) {
  const path = Skia.PathBuilder.Make()
    .moveTo(6, 6)
    .lineTo(width - 6, 6)
    .detach();
  return <Drain path={path} width={width} height={12} stroke={12} {...props} />;
}
