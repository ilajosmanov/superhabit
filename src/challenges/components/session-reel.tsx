import { useState, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { OVER_VIDEO, Screens, useReel } from './reel-player';
import { SessionViewer } from './session-viewer';
import { IconButton } from '@/components/icon-button';
import type { Clip, Spot } from '@/challenges/reel';

/**
 * The session's sets on a loop, one after another, sized and placed by `className`; `children` (given the
 * set on screen) draw over it, and `expand` places a button that opens it full screen, as a tap does.
 * `sets` is how many sets the session has, filmed or not. While full screen is open the loop lets go of its
 * players, and picks up where full screen left off.
 */
export function SessionLoop({
  clips,
  sets,
  expand,
  className,
  children,
}: {
  clips: readonly Clip[];
  sets: number;
  expand: Pick<ViewStyle, 'top' | 'right' | 'bottom'>;
  className: string;
  children: (clip: Clip) => ReactNode;
}) {
  const [watching, setWatching] = useState<Spot | null>(null);
  const [from, setFrom] = useState<Spot>({ clip: 0, part: 0 });
  if (watching)
    return (
      <>
        <View className={className}>{children(clips[watching.clip])}</View>
        <SessionViewer
          clips={clips}
          sets={sets}
          start={watching}
          onClose={(at) => {
            setFrom(at);
            setWatching(null);
          }}
        />
      </>
    );
  return (
    <Loop clips={clips} start={from} expand={expand} className={className} onWatch={setWatching}>
      {children}
    </Loop>
  );
}

function Loop({
  clips,
  start,
  expand,
  className,
  onWatch,
  children,
}: {
  clips: readonly Clip[];
  start: Spot;
  expand: Pick<ViewStyle, 'top' | 'right' | 'bottom'>;
  className: string;
  onWatch: (at: Spot) => void;
  children: (clip: Clip) => ReactNode;
}) {
  const { players, front, spot } = useReel(clips, start);
  return (
    // Tap anywhere for sight; TalkBack gets the button below and still reads the text over the video.
    <Pressable onPress={() => onWatch(spot)} accessible={false} className={className}>
      <View className="absolute inset-0 opacity-75" pointerEvents="none">
        <Screens players={players} front={front} fit="cover" />
      </View>
      {children(clips[spot.clip])}
      <IconButton
        icon="open_in_full"
        label="Watch the session full screen"
        size={18}
        fill={OVER_VIDEO}
        onPress={() => onWatch(spot)}
        style={{ position: 'absolute', ...expand }}
      />
    </Pressable>
  );
}
