import { useActorRef, useSelector } from '@xstate/react';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { StyleSheet } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

import { after, type Clip, type Spot } from '@/challenges/reel';
import { reelPlayback } from '@/challenges/reel-playback';

/** Ground at 70 %: buttons over the playing video. */
export const OVER_VIDEO = 'rgba(13,14,11,0.7)';
/** How often a player reports its time, s; the bar glides across each interval. */
const REPORT_S = 0.1;

/**
 * The reel's two players, played by `reelPlayback` from `start`: muted (the files have no sound, and sound
 * would take audio focus from the user's music). `go` jumps to a file, `along` (0 to 1) into it;
 * `progress` is how far through the clip on screen, 0 to 1, kept off React state because it moves ten
 * times a second.
 */
export function useReel(clips: readonly Clip[], start: Spot) {
  const uri = ({ clip, part }: Spot) => clips[clip].takes[part];
  const setup = (play: boolean) => (p: VideoPlayer) => {
    p.muted = true;
    p.timeUpdateEventInterval = REPORT_S;
    if (play) p.play();
  };
  // Sources fixed at mount: a changed source would make the hook replace it behind the machine's back.
  const players = [
    useVideoPlayer(uri(start), setup(true)),
    useVideoPlayer(uri(after(clips, start)), setup(false)),
  ] as const;
  const progress = useSharedValue(0);
  const reel = useActorRef(reelPlayback, {
    input: {
      clips,
      players,
      start,
      // Glides to the reported time over one report, instead of stepping ten times a second.
      onProgress: (along, glide) =>
        progress.set(
          glide ? withTiming(along, { duration: REPORT_S * 1000, easing: Easing.linear }) : along,
        ),
    },
  });
  const spot = useSelector(reel, (s) => s.context.spot);
  const front = useSelector(reel, (s) => s.context.front);
  const go = (to: Spot, along = 0) => reel.send({ type: 'go', to, along });
  return { players, front, shown: players[front], spot, go, progress };
}

/** Both players' views, stacked; only the one playing shows. */
export function Screens({
  players,
  front,
  fit,
}: {
  players: readonly [VideoPlayer, VideoPlayer];
  front: number;
  fit: 'contain' | 'cover';
}) {
  return players.map((player, i) => (
    // TextureView: a SurfaceView ignores the parent's opacity and the viewer's drag transform.
    <VideoView
      // The two players never swap places.
      key={i}
      player={player}
      style={[StyleSheet.absoluteFill, { opacity: i === front ? 1 : 0 }]}
      contentFit={fit}
      nativeControls={false}
      surfaceType="textureView"
    />
  ));
}
