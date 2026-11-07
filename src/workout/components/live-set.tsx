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

function Segments({ reps, target }: { reps: number; target: number }) {
  // Open-ended sets have nothing to fill.
  if (!Number.isFinite(target)) return null;
  return (
    <View className="flex-row gap-1">
      {Array.from({ length: target }, (_, i) => (
        <View key={i} className={`h-2 flex-1 rounded ${i < reps ? 'bg-accent' : 'bg-chalk/14'}`} />
      ))}
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
  const count = (
    <RepCount
      reps={unit === 'seconds' ? heldS : reps}
      target={unit === 'seconds' ? goalS : target}
      unit={unit}
      flash={flash === 'rep'}
    />
  );
  const segments = unit === 'reps' && <Segments reps={reps} target={target} />;
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
    noRep && gauge && <NoRepCard cue={noRep.cue} depth={noRep.depth} gauge={gauge} />
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
