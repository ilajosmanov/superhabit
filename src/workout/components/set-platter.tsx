import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { CHECK, CLOSE, FLIP_CAMERA, Glyph, SKELETON } from '@/components/glyph';
import { EXERCISES, type BodyPart } from '@/exercises/registry';
import { colors } from '@/theme';
import type { SessionView } from '@/workout/session';

import { Chip, GLASS, Label, mmss, MuteButton, SecondaryButton } from './controls';
import { DepthGauge } from './depth-gauge';
import { RepCount } from './rep-count';
import { RepStrip } from './rep-strip';

const PART_LABEL: Record<BodyPart, string> = {
  head: 'Head and shoulders',
  hands: 'Hands',
  hips: 'Hips',
  feet: 'Feet',
};

export type PlatterProps = {
  view: SessionView;
  landscape: boolean;
  angle: SharedValue<number | null>;
  lowest: SharedValue<number | null>;
  onPause: () => void;
  onEndSet: () => void;
  onResume: () => void;
  onRestart: () => void;
  onEnd: () => void;
  onToggleVoice: () => void;
  onToggleSkeleton: () => void;
  onFlipCamera: () => void;
};

const setLabel = ({ name, set, sets }: SessionView) =>
  `${name.toUpperCase()}${sets > 1 ? ` · ${set} OF ${sets}` : ''}`;

/** The floating card beside (landscape) or under (portrait) the camera: position check, live set or paused. */
export function SetPlatter(props: PlatterProps) {
  const { view, landscape } = props;
  return (
    <View className={`gap-3 rounded-4xl ${GLASS} ${landscape ? 'w-62 p-4' : 'p-5'}`}>
      {view.stage === 'paused' ? (
        <PausedSet {...props} />
      ) : view.phase === 'waiting' && !view.started ? (
        <PositionCheck {...props} />
      ) : (
        <LiveSet {...props} />
      )}
    </View>
  );
}

/** Label row with `children` chips; the mute chip lives here in landscape, in the top bar in portrait. */
function Header({
  view,
  landscape,
  onToggleVoice,
  children,
}: PlatterProps & { children?: ReactNode }) {
  return (
    <View className={`flex-row items-center justify-between ${landscape ? 'h-9' : ''}`}>
      <Label>{setLabel(view)}</Label>
      <View className="flex-row gap-2">
        {children}
        {landscape && <MuteButton muted={view.muted} onPress={onToggleVoice} />}
      </View>
    </View>
  );
}

/** Board 09: waiting for the start position, with what is out of frame. */
function PositionCheck(props: PlatterProps) {
  const { view, landscape, onFlipCamera, onToggleSkeleton } = props;
  const { ready, parts, hint } = EXERCISES[view.exercise];
  return (
    <>
      <Header {...props}>
        <Chip d={FLIP_CAMERA} label="Switch camera" onPress={onFlipCamera} />
        <Chip d={SKELETON} label="Skeleton" checked={view.skeleton} onPress={onToggleSkeleton} />
      </Header>
      <Text
        accessibilityRole="header"
        className="font-sans text-4xl font-light leading-tight tracking-tight text-chalk"
      >
        {ready}
      </Text>
      <View className="mt-1.5 gap-2.5">
        {parts.map((part) => {
          const out = view.missing.includes(part);
          return (
            <View
              key={part}
              accessible
              accessibilityLabel={`${PART_LABEL[part]}, ${out ? 'out of frame' : 'in frame'}`}
              className="flex-row items-center gap-2.5"
            >
              <Glyph
                d={out ? CLOSE : CHECK}
                size={16}
                weight={2.5}
                color={out ? colors.warn : colors.accent}
              />
              <Text className={`font-sans text-base ${out ? 'text-warn' : 'text-chalk'}`}>
                {PART_LABEL[part]}
                {out && ' · out of frame'}
              </Text>
            </View>
          );
        })}
      </View>
      <Text className={`font-sans text-sm leading-snug text-soft ${landscape ? 'mt-auto' : ''}`}>
        {hint}
      </Text>
    </>
  );
}

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

function NoRepCard({ cue, depth, down }: { cue: string | null; depth: number; down: number }) {
  return (
    <View accessibilityLiveRegion="polite" className="gap-1 rounded-2xl bg-warn/16 px-3 py-2.5">
      <Text className="font-sans text-lg leading-tight text-chalk">{cue ?? 'No rep'}</Text>
      <Text className="font-mono text-xs font-medium tracking-wider text-warn">
        NO-REP · {Math.round(depth)}°/{down}°
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

function PauseIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" pointerEvents="none">
      <Rect x={6} y={5} width={4} height={14} rx={1} fill={colors.chalk} />
      <Rect x={14} y={5} width={4} height={14} rx={1} fill={colors.chalk} />
    </Svg>
  );
}

/**
 * Boards 10, 11 and 13: the count, its segments, the live depth gauge; a warn card after a no-rep.
 * Board 15: pose lost mid-set, the count stays, a hint replaces the gauge and End set turns primary.
 */
function LiveSet(props: PlatterProps) {
  const { view, landscape, angle, lowest, onPause, onEndSet } = props;
  const { reps, target, call, flash, gauge } = view;
  const lost = view.phase === 'waiting';
  const noRep = call && !call.counted ? call : null;
  const count = <RepCount reps={reps} target={target} flash={flash === 'rep'} />;
  const depth = !lost && (
    <DepthGauge
      angle={angle}
      lowest={lowest}
      down={gauge.down}
      warn={noRep !== null && flash === 'noRep'}
      lastDepth={call?.depth ?? null}
      track={landscape ? 'flex-1' : 'h-22'}
    />
  );
  const card = lost ? (
    <LostCard ready={EXERCISES[view.exercise].ready} missing={view.missing} />
  ) : (
    noRep && <NoRepCard cue={noRep.cue} depth={noRep.depth} down={gauge.down} />
  );
  const size = landscape ? 'size-11' : 'size-12';
  const height = landscape ? 'h-11' : 'h-12';

  return (
    <>
      <Header {...props} />
      {landscape ? (
        <View className="min-h-0 flex-1 flex-row gap-3">
          <View className="flex-1 gap-2.5">
            {count}
            <Segments reps={reps} target={target} />
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
          <Segments reps={reps} target={target} />
          {card}
        </>
      )}
      <View className={`flex-row gap-2 ${landscape ? '' : 'mt-1'}`}>
        <Pressable
          onPress={onPause}
          accessibilityRole="button"
          accessibilityLabel="Pause"
          className={`${size} items-center justify-center rounded-full bg-chalk/10`}
        >
          <PauseIcon />
        </Pressable>
        {lost ? (
          <Pressable
            onPress={onEndSet}
            accessibilityRole="button"
            className={`flex-1 items-center justify-center rounded-full bg-accent ${height}`}
          >
            <Text className="font-sans text-base font-medium text-ground">End set · {reps}</Text>
          </Pressable>
        ) : (
          <SecondaryButton onPress={onEndSet} label="End set" className={`flex-1 ${height}`} />
        )}
      </View>
    </>
  );
}

/** Board 12: nothing counts; resume, restart the set, or end the challenge. */
function PausedSet(props: PlatterProps) {
  const { view, landscape, onResume, onRestart, onEnd, onToggleSkeleton, onFlipCamera } = props;
  // Landscape compacts so all of it fits a 360dp-tall screen; portrait keeps the full sizes.
  const pill = landscape ? 'h-9 flex-1' : 'h-11 flex-1';
  return (
    <>
      <Label>
        {setLabel(view)} · {mmss(view.elapsedS)}
      </Label>
      <View className="flex-row items-end justify-between">
        <RepCount reps={view.reps} target={view.target} size={landscape ? 'sm' : 'md'} />
        {view.attempts.length > 0 && (
          <View className="items-end gap-1.5 pb-2">
            <RepStrip attempts={view.attempts} down={view.gauge.down} bar={9} />
            <Text className="font-mono text-xs tracking-widest text-muted">THIS SET</Text>
          </View>
        )}
      </View>
      <View className={landscape ? 'mt-auto gap-1.5' : 'mt-2 gap-2'}>
        <View className="flex-row gap-2">
          <SecondaryButton
            onPress={onToggleSkeleton}
            label={`Skeleton ${view.skeleton ? 'on' : 'off'}`}
            checked={view.skeleton}
            className={pill}
          />
          <SecondaryButton
            onPress={onFlipCamera}
            // Flipping from paused zeroes this set; say so once it has something to lose.
            label={view.started ? 'Flip & restart' : 'Switch camera'}
            hint={view.started ? 'Restarts this set on the other camera' : undefined}
            className={pill}
          />
        </View>
        <Pressable
          onPress={onResume}
          accessibilityRole="button"
          className={`items-center justify-center rounded-full bg-accent ${landscape ? 'h-11' : 'h-13'}`}
        >
          <Text className="font-sans text-lg font-medium text-ground">Resume</Text>
        </Pressable>
        <SecondaryButton
          onPress={onRestart}
          label="Restart set"
          className={landscape ? 'h-9' : 'h-11'}
        />
        <Pressable
          onPress={onEnd}
          accessibilityRole="button"
          className={`items-center justify-center ${landscape ? 'h-9' : 'h-10'}`}
        >
          <Text className="font-sans text-base text-warn">End challenge</Text>
        </Pressable>
      </View>
    </>
  );
}
