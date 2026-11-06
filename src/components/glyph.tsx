import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * A line icon: an SVG path drawn on a `box`×`box` grid, scaled to `size`, stroked 1.5 like the design.
 * SVG, not Skia: a Skia canvas is its own GPU surface and blinks when a tab re-attaches.
 */
export function Glyph({
  d,
  size,
  box = 24,
  color = colors.chalk,
  weight = 1.5,
}: {
  d: string;
  size: number;
  box?: number;
  color?: string;
  /** Stroke width on the `box` grid. */
  weight?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} pointerEvents="none">
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

export const CLOSE = 'M6 6l12 12M18 6 6 18';
export const CHECK = 'm5 12 5 5 9-10';
