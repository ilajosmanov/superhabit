import { Canvas, Path, Skia, useClock, type SkPath } from '@shopify/react-native-skia';
import { useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { colors } from '@/theme';

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

/** Board 18b: the screen's own edge is the countdown, drawn round the display's corners. */
export function EdgeClock(props: Clock) {
  const { width, height } = useWindowDimensions();
  // shortcut: one corner radius for every phone; read the display's real corners if it looks off on one.
  const path = Skia.PathBuilder.Make()
    .addRRect(Skia.RRectXY(Skia.XYWHRect(5, 5, width - 10, height - 10), 30, 30))
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
