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

export const ARROW_RIGHT = 'M5 12h14M13 6l6 6-6 6';
export const CLOSE = 'M6 6l12 12M18 6 6 18';
export const CHECK = 'm5 12 5 5 9-10';
export const SPEAKER = 'M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7';
export const SPEAKER_ON = `${SPEAKER}M18.5 5.5a9 9 0 0 1 0 13`;
export const SPEAKER_OFF = 'M11 5 6 9H3v6h3l5 4V5ZM16 9.5l5 5M21 9.5l-5 5';
export const FLIP_CAMERA =
  'M3 8.5A1.5 1.5 0 0 1 4.5 7h2.3l1.5-2h7.4l1.5 2h2.3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-9ZM8.5 12.5a3.5 3.5 0 0 1 6.3-2.1M15 8.5v2h-2M15.5 13.5a3.5 3.5 0 0 1-6.3 2.1M9 17.5v-2h2';
export const SKELETON =
  'M10 4.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 6.5V14M7 10.5l5-2 5 2M12 14l-3 6M12 14l3 6';
