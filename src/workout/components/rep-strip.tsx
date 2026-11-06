import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';
import type { Attempt } from '@/workout/session';

import { depthAt } from './depth-gauge';

const H = 28;
const GAP = 6;
const MAX_WIDTH = 192;

/** One bar per attempt, its height the rep's depth (accent clean, warn no-rep), with a dashed line at `down`. */
export function RepStrip({
  attempts,
  down,
  bar = 10,
}: {
  attempts: readonly Attempt[];
  down: number;
  bar?: number;
}) {
  if (!attempts.length) return null;
  const step = bar + GAP;
  const width = attempts.length * step;
  const line = H - depthAt(down, down) * H;
  const said = attempts
    .map(({ counted, depth }) => `${Math.round(depth)}${counted ? '' : ' no-rep'}`)
    .join(', ');
  return (
    <Svg
      // A long open-ended set squeezes into MAX_WIDTH instead of pushing the stats off screen.
      width={Math.min(width, MAX_WIDTH)}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      preserveAspectRatio="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${attempts.length} attempts, depth in degrees: ${said}`}
    >
      {attempts.map(({ counted, depth }, i) => {
        const h = Math.max(2, depthAt(depth, down) * H);
        return (
          <Rect
            // Attempts only ever append.
            key={i}
            x={i * step}
            y={H - h}
            width={bar}
            height={h}
            rx={2}
            fill={counted ? colors.accent : colors.warn}
          />
        );
      })}
      <Path
        d={`M0 ${line}H${width}`}
        stroke={colors.chalk}
        strokeWidth={1}
        strokeDasharray="2 2"
        strokeOpacity={0.6}
      />
    </Svg>
  );
}
