import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';
import type { Attempt } from '@/workout/plan/results';

import { depthAt, depthText, type Gauge } from './depth';

const H = 28;
const GAP = 6;
const MAX_WIDTH = 192;

/** One bar per attempt, its height the rep's depth (accent clean, warn no-rep), with a dashed line at `gauge.down`. */
export function RepStrip({
  attempts,
  gauge,
  bar = 10,
}: {
  attempts: readonly Attempt[];
  gauge: Gauge;
  bar?: number;
}) {
  const bars = attempts.filter(
    (attempt): attempt is Attempt & { depth: number } => attempt.depth !== null,
  );
  if (!bars.length) return null;
  const step = bar + GAP;
  const width = bars.length * step;
  const line = H - depthAt(gauge.down, gauge) * H;
  const said = bars
    .map(({ counted, depth }) => `${depthText(depth, gauge)}${counted ? '' : ' no-rep'}`)
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
      accessibilityLabel={`${bars.length} attempts, depth: ${said}`}
    >
      {bars.map(({ counted, depth }, i) => {
        const h = Math.max(2, depthAt(depth, gauge) * H);
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
