import { useState } from 'react';
import { Text, View } from 'react-native';

import { Numeral } from './numeral';
import { RepChart } from './rep-chart';
import { isHold } from '@/challenges/hold';
import { setDetail } from '@/challenges/set-detail';
import { useColors } from '@/components/colors';
import { Sheet } from '@/components/sheet';
import { TonalButton } from '@/components/tonal-button';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { countsAt, depthText } from '@/lib/depth';
import { mss } from '@/lib/duration';
import { capitalise } from '@/lib/text';
import { reached, type Goal } from '@/workout/plan/plan';

/** "0.4S": seconds as the app writes them, the unit beside the number. */
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}S`;

/**
 * Board 32b: one set up close, over the page that listed it. What it got as the giant number; for reps,
 * every attempt as a bar as deep as it went (the dashed line is where a rep counts), the deepest clean rep
 * and its typical tempo, then each no-rep with the call the session made. A hold keeps only its time and
 * breaks. `onPlay` (when it has video) plays it.
 */
export function SetSheet({
  exercise,
  goal,
  kicker,
  kept,
  onPlay,
  onDismiss,
}: {
  exercise: ExerciseId;
  goal: Goal;
  /** "SET 2 · ROUND 1 · 07:42" */
  kicker: string;
  kept: Parameters<typeof setDetail>[0];
  onPlay?: () => void;
  onDismiss: () => void;
}) {
  const colors = useColors();
  // The rep picked on the chart; none until a bar is tapped.
  const [picked, setPicked] = useState<number | null>(null);
  const { gauge } = EXERCISES[exercise];
  const hold = isHold(exercise);
  const detail = setDetail(kept, gauge);
  const of = goal.type === 'max' ? 'MAX' : `OF ${goal.type === 'reps' ? goal.n : mss(goal.n)}`;
  const charted = gauge && detail.attempts.some(({ depth }) => depth !== null);
  const rep = picked === null ? null : detail.attempts.at(picked);
  const numbers: { n: string; label: string; warn?: boolean }[] = hold
    ? [
        {
          n: String(detail.noReps),
          label: detail.noReps === 1 ? 'BREAK' : 'BREAKS',
          warn: detail.noReps > 0,
        },
      ]
    : detail.reps === 0
      ? []
      : [
          ...(detail.deepest === null ? [] : [{ n: depthText(detail.deepest), label: 'DEEPEST' }]),
          ...(detail.downMs === null ? [] : [{ n: seconds(detail.downMs), label: 'DOWN' }]),
          ...(detail.upMs === null ? [] : [{ n: seconds(detail.upMs), label: 'UP' }]),
          ...(detail.repMs === null ? [] : [{ n: seconds(detail.repMs), label: 'A REP' }]),
        ];
  return (
    <Sheet
      open
      onDismiss={onDismiss}
      footer={
        onPlay && <TonalButton wide icon="play_arrow" label="Play this set" onPress={onPlay} />
      }
    >
      <View className="gap-2">
        <Text className="font-mono text-xs tracking-widest text-muted">{kicker}</Text>
        <Text accessibilityRole="header" className="font-sans text-3xl font-light text-chalk">
          {capitalise(EXERCISES[exercise].name)}
        </Text>
      </View>

      <Numeral
        n={hold ? mss(Math.floor(detail.heldMs / 1000)) : detail.reps}
        labels={[of, hold ? 'HELD' : 'CLEAN REPS']}
        met={reached(goal, detail)}
      />

      {charted && (
        <View className="gap-2.5">
          <View className="flex-row justify-between">
            <Text className="font-mono text-xs tracking-widest text-muted">DEPTH, REP BY REP</Text>
            <Text className="font-mono text-xs tracking-widest text-muted">
              {`${countsAt(gauge)} COUNTS`}
            </Text>
          </View>
          <RepChart
            attempts={detail.attempts}
            gauge={gauge}
            selected={picked}
            onSelect={setPicked}
          />
          {/* Two lines tall either way, so picking a rep doesn't move the sheet. */}
          <View accessibilityLiveRegion="polite" className="min-h-12 gap-1">
            {rep && picked !== null ? (
              <>
                <Text className="font-mono text-xs tracking-widest text-chalk">
                  <Text style={{ color: rep.counted ? colors.mark : colors.warn }}>
                    {`REP ${picked + 1}`}
                  </Text>
                  {[
                    rep.depth === null ? null : depthText(rep.depth),
                    rep.bottomMs === null ? null : `${seconds(rep.bottomMs - rep.startMs)} DOWN`,
                    rep.bottomMs === null ? null : `${seconds(rep.endMs - rep.bottomMs)} UP`,
                  ]
                    .filter((part) => part !== null)
                    .map((part) => ` · ${part}`)
                    .join('')}
                </Text>
                <Text className="font-sans text-base text-soft">
                  {rep.counted ? (rep.cue ?? 'Counted') : (rep.cue ?? 'Not counted')}
                </Text>
              </>
            ) : (
              <Text className="font-mono text-xs tracking-widest text-muted">
                TAP A BAR FOR ITS REP
              </Text>
            )}
          </View>
        </View>
      )}

      {numbers.length > 0 && (
        <View className="flex-row gap-3">
          {numbers.map(({ n, label, warn }) => (
            <View key={label} className="flex-1 gap-2">
              <Text
                className="font-sans text-4xl font-extralight tracking-tight"
                style={{ color: warn ? colors.warn : colors.chalk }}
              >
                {n}
              </Text>
              <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
            </View>
          ))}
        </View>
      )}

      {!hold && detail.misses.length > 0 && (
        <View>
          <Text className="pb-2 font-mono text-xs tracking-widest" style={{ color: colors.warn }}>
            {`${detail.misses.length} ${detail.misses.length === 1 ? 'NO-REP' : 'NO-REPS'}`}
          </Text>
          {detail.misses.map(({ n, cue, depth }) => (
            <View
              key={n}
              accessible
              accessibilityLabel={`Rep ${n}, not counted${cue ? `: ${cue}` : ''}`}
              className="flex-row items-baseline gap-3 border-t border-line py-3"
            >
              <Text
                className="w-14 font-mono text-xs tracking-widest"
                style={{ color: colors.warn }}
              >
                {`REP ${n}`}
              </Text>
              <Text className="flex-1 font-sans text-base text-soft">{cue ?? 'Not counted'}</Text>
              {depth !== null && (
                <Text className="font-mono text-xs tracking-wide text-muted">
                  {depthText(depth)}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}
