import { Text, View } from 'react-native';

import { EXERCISES, type BodyPart } from '@/exercises/registry';

import { CHIP_FILL, SecondaryButton } from './controls';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { depthText, type Gauge } from './depth';
import { DepthGauge } from './depth-gauge';
import { Header, type PlatterProps } from './platter-header';
import { PART_LABEL } from './position-check';
import { RepCount } from './rep-count';

/**
 * A segment per rep up to `most`, one filled bar past that (a 120-rep strip would be all gaps). `showTarget`
 * writes the goal at its end, for a count drawn without its "/target".
 */
function Segments({
  reps,
  target,
  most,
  showTarget,
}: {
  reps: number;
  target: number;
  most: number;
  showTarget: boolean;
}) {
  // Open-ended sets have nothing to fill.
  if (!Number.isFinite(target)) return null;
  return (
    <View className="flex-row items-center gap-2">
      {target <= most ? (
        <View className="flex-1 flex-row gap-1">
          {Array.from({ length: target }, (_, i) => (
            <View
              key={i}
              className={`h-2 flex-1 rounded ${i < reps ? 'bg-accent' : 'bg-chalk/14'}`}
            />
          ))}
        </View>
      ) : (
        <View className="h-2 flex-1 overflow-hidden rounded bg-chalk/14">
          <View
            className="h-2 rounded bg-accent"
            style={{ width: `${Math.min(100, (reps / target) * 100)}%` }}
          />
        </View>
      )}
      {showTarget && (
        <Text
          maxFontSizeMultiplier={1.3}
          className="font-mono text-xs font-medium tracking-widest text-muted"
        >
          OF {target}
        </Text>
      )}
    </View>
  );
}

function NoRepCard({ cue, depth, gauge }: { cue: string | null; depth: number; gauge: Gauge }) {
  return (
    <View accessibilityLiveRegion="polite" className="gap-1 rounded-2xl bg-warn/16 px-3 py-2.5">
      <Text className="font-sans text-lg leading-tight text-chalk">{cue ?? 'No rep'}</Text>
      <Text className="font-mono text-xs font-medium tracking-wider text-warn">
        NO-REP · {depthText(depth, gauge)}/{depthText(gauge.down, gauge)}
      </Text>
    </View>
  );
}

/** In place of the depth gauge once the pose is lost mid-set: how to carry on, and what is out of frame. */
function LostCard({ ready, missing }: { ready: string; missing: readonly BodyPart[] }) {
  return (
    <View accessibilityLiveRegion="polite" className="gap-1 rounded-2xl bg-chalk/8 px-3 py-2.5">
      <Text className="font-sans text-lg leading-tight text-chalk">{ready} to keep counting</Text>
      {missing.length > 0 && (
        <Text className="font-mono text-xs font-medium tracking-wider text-soft">
          {missing
            .map((part) => PART_LABEL[part])
            .join(', ')
            .toUpperCase()}{' '}
          OUT OF FRAME
        </Text>
      )}
    </View>
  );
}

/**
 * Boards 10, 11 and 13: the count, its segments, the live depth gauge; a warn card after a no-rep.
 * Board 15: pose lost mid-set, the count stays, a hint replaces the gauge and End set turns primary.
 */
export function LiveSet(props: PlatterProps) {
  const { view, landscape, angle, lowest, onPause, onEndSet } = props;
  const { reps, target, heldS, goalS, unit, call, flash, gauge } = view;
  const lost = view.phase === 'waiting';
  const noRep = call && !call.counted ? call : null;
  const amount = unit === 'seconds' ? heldS : reps;
  const goal = unit === 'seconds' ? goalS : target;
  // The landscape platter has 216 px, 152 beside the depth gauge: three digits step down to 96 ("100/100"
  // at 128 is ~260), and beside the gauge the "/target" moves to the end of the segments ("20/20" at 128
  // is ~207).
  const wide = Math.max(amount, Number.isFinite(goal) ? goal : 0) >= 100;
  const bare = landscape && gauge !== null && !lost;
  const count = (
    <RepCount
      reps={amount}
      target={goal}
      unit={unit}
      size={landscape && wide ? 'md' : 'lg'}
      bare={bare}
      flash={flash === 'rep'}
    />
  );
  // Segments stay readable (≥ 6 px) up to 15 in the narrow landscape column, 10 when "OF n" shares it, 30 in portrait.
  const segments = unit === 'reps' && (
    <Segments
      reps={reps}
      target={target}
      most={landscape ? (bare ? 10 : 15) : 30}
      showTarget={bare}
    />
  );
  const endLabel = unit === 'seconds' ? `End set · ${heldS}s` : 'End set';
  const depth = !lost && gauge && (
    <DepthGauge
      angle={angle}
      lowest={lowest}
      gauge={gauge}
      warn={noRep !== null && flash === 'noRep'}
      lastDepth={call?.depth ?? null}
      track={landscape ? 'flex-1' : 'h-22'}
    />
  );
  const card = lost ? (
    <LostCard ready={EXERCISES[view.exercise].ready} missing={view.missing} />
  ) : (
    noRep &&
    noRep.depth !== null &&
    gauge && <NoRepCard cue={noRep.cue} depth={noRep.depth} gauge={gauge} />
  );
  const height = landscape ? 'h-11' : 'h-12';

  return (
    <>
      <Header {...props} />
      {landscape ? (
        <View className="min-h-0 flex-1 flex-row gap-3">
          <View className="flex-1 gap-2.5">
            {count}
            {segments}
            {card}
          </View>
          {depth}
        </View>
      ) : (
        <>
          <View className="flex-row items-end justify-between">
            {count}
            {depth}
          </View>
          {segments}
          {card}
        </>
      )}
      <View className={`flex-row gap-2 ${landscape ? '' : 'mt-1'}`}>
        <IconButton icon="pause" label="Pause" fill={CHIP_FILL} onPress={onPause} />
        {lost ? (
          <PrimaryButton
            onPress={onEndSet}
            label={unit === 'seconds' ? endLabel : `End set · ${reps}`}
            className={`flex-1 ${height}`}
          />
        ) : (
          <SecondaryButton onPress={onEndSet} label={endLabel} className={`flex-1 ${height}`} />
        )}
      </View>
    </>
  );
}
