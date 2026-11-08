import { describe, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';
import type { VideoPlayerEvents, VideoSource } from 'expo-video';

import { reps } from '@/workout/plan';
import { reelOf } from './reel';
import { reelPlayback } from './reel-playback';
import type { StepResult } from '@/workout/results';

const set = (takes: string[]): StepResult => ({
  exercise: 'squat',
  round: 1,
  startedAt: 0,
  endedAt: 10_000,
  goal: reps(10),
  reps: 0,
  noReps: 0,
  heldMs: 0,
  attempts: [],
  takes,
  stats: null,
});

// A set in one file, then a set in two (a pause between).
const clips = reelOf([set(['a']), set(['b', 'c'])]);

/** A player holding a file, reporting as the real one would. Every file is 10 s long once loaded. */
function fake(file: string) {
  const on: Partial<VideoPlayerEvents> = {};
  const player = {
    file,
    /** Files loaded since it was made: each one blanks the picture while it loads. */
    loads: 0,
    playing: false,
    duration: 0,
    currentTime: 0,
    play: () => void (player.playing = true),
    pause: () => void (player.playing = false),
    seekBy: (seconds: number) => void (player.currentTime += seconds),
    replaceAsync: (source: VideoSource) => {
      // The reel only ever passes a file's uri.
      Object.assign(player, {
        loads: player.loads + 1,
        file: typeof source === 'string' ? source : '',
        duration: 0,
        currentTime: 0,
      });
      return Promise.resolve();
    },
    addListener: <E extends keyof VideoPlayerEvents>(event: E, listener: VideoPlayerEvents[E]) => {
      on[event] = listener;
      return { remove: () => void delete on[event] };
    },
    listening: () => Object.keys(on),
    load: () => {
      player.duration = 10;
      on.sourceLoad?.({
        duration: 10,
        videoSource: player.file,
        availableVideoTracks: [],
        availableSubtitleTracks: [],
        availableAudioTracks: [],
      });
    },
    at: (currentTime: number) =>
      on.timeUpdate?.({
        currentTime,
        currentLiveTimestamp: null,
        currentOffsetFromLive: null,
        bufferedPosition: 10,
      }),
    end: () => on.playToEnd?.(),
    fail: () => on.statusChange?.({ status: 'error' }),
  };
  return player;
}

function reel() {
  // As the screen makes them: the first holding the start, playing; the second the file after it.
  const players = [fake('a'), fake('b')] as const;
  players[0].play();
  const onProgress = vi.fn<(along: number, glide: boolean) => void>();
  const actor = createActor(reelPlayback, {
    input: { clips, players, start: { clip: 0, part: 0 }, onProgress },
  }).start();
  const on = () => players.map(({ file, playing }) => (playing ? file : `(${file})`)).join(' ');
  return { players, actor, onProgress, on, spot: () => actor.getSnapshot().context.spot };
}

describe('the reel playback', () => {
  it('ends each file straight into the next, the other player loading the one after', () => {
    const { players, on, spot } = reel();
    players[0].end();
    expect(on()).toBe('(c) b');
    expect(spot()).toEqual({ clip: 1, part: 0 });
    players[1].end();
    expect(on()).toBe('c (a)');
    players[0].end();
    expect(on()).toBe('(b) a'); // back to the first after the last
    expect(spot()).toEqual({ clip: 0, part: 0 });
  });

  it('moves only with the player on screen', () => {
    const { players, on, onProgress } = reel();
    players[0].load();
    players[1].load();
    players[1].end();
    players[1].at(5);
    expect(on()).toBe('a (b)');
    expect(onProgress).not.toHaveBeenCalled();
    players[0].at(5);
    expect(onProgress).toHaveBeenLastCalledWith(0.5, true);
  });

  it('measures progress through the whole clip, not the file', () => {
    const { players, actor, onProgress } = reel();
    actor.send({ type: 'go', to: { clip: 1, part: 1 }, along: 0 });
    expect(onProgress).toHaveBeenLastCalledWith(0.5, false); // the second of two files
    players[0].load();
    players[0].at(5);
    expect(onProgress).toHaveBeenLastCalledWith(0.75, true);
  });

  it('seeks within the file on screen', () => {
    const { players, actor } = reel();
    players[0].load();
    actor.send({ type: 'go', to: { clip: 0, part: 0 }, along: 0.5 });
    expect(players[0].currentTime).toBe(5);
  });

  it('resumes a scrub across files where the finger stopped once the file loads', () => {
    const { players, actor, on, onProgress } = reel();
    players[0].load();
    actor.send({ type: 'go', to: { clip: 1, part: 1 }, along: 0.3 });
    expect(on()).toBe('c (a)');
    actor.send({ type: 'go', to: { clip: 1, part: 1 }, along: 0.6 }); // the finger moves on while it loads
    expect(onProgress).toHaveBeenLastCalledWith(0.8, false);
    expect(players[0]).toMatchObject({ currentTime: 0, loads: 1 }); // not loaded again
    players[1].load(); // the file after it loads first
    expect(players[0].currentTime).toBe(0);
    players[0].load();
    expect(players[0].currentTime).toBe(6);
  });

  it('drops a pending seek when the reel moves on', () => {
    const { players, actor, on } = reel();
    actor.send({ type: 'go', to: { clip: 1, part: 1 }, along: 0.5 });
    actor.send({ type: 'go', to: { clip: 0, part: 0 }, along: 0 }); // the next file: c, then a
    expect(on()).toBe('(b) a');
    players[1].load();
    expect(players[1].currentTime).toBe(0);
  });

  it('skips a file that fails to load and plays on', () => {
    const { players, actor, on, spot } = reel();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    actor.send({ type: 'go', to: { clip: 1, part: 0 }, along: 0.5 });
    players[1].fail(); // the waiting player's file
    expect(on()).toBe('b (c)');
    players[0].fail();
    expect(on()).toBe('(a) c');
    expect(spot()).toEqual({ clip: 1, part: 1 });
    players[1].load();
    actor.send({ type: 'go', to: { clip: 1, part: 1 }, along: 0.5 }); // not waiting on the failed load
    expect(players[1].currentTime).toBe(5);
  });

  it('skips once when every file fails, rather than round and round', () => {
    const { players, actor, on } = reel();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    actor.send({ type: 'go', to: { clip: 1, part: 0 }, along: 0.5 }); // a jump: b, then c after it
    players[0].fail();
    players[1].fail();
    players[0].fail();
    expect(on()).toBe('(a) c');
  });

  it('stops listening to the players when it stops', () => {
    const { players, actor } = reel();
    actor.stop();
    expect(players.map((player) => player.listening())).toEqual([[], []]);
  });
});
