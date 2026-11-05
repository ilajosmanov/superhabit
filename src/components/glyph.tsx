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
}: {
  d: string;
  size: number;
  box?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} pointerEvents="none">
      <Path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export const ARROW_RIGHT = 'M5 12h14M13 6l6 6-6 6';
