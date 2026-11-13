import { files, modules } from '@/workout/__fixtures__/session';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';
import type { VideoPlayerEvents, VideoPlayerStatus, VideoSource } from 'expo-video';

import { reps } from '@/workout/plan/plan';
import { deleteVideos, videoIndex } from '@/storage/set-files';
import { set as keptSet } from '@/challenges/__fixtures__/progress';
import { expand } from '@/workout/plan/plan';
import { dayReel, reelOf } from './reel';
import { openReel, reelPlayback } from './reel-playback';
import type { StepResult } from '@/workout/plan/results';

vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('@/storage/account', () => ({ userId: () => 'local' }));
afterEach(() => files.clear());

const set = (takes: string[]): StepResult => ({
  id: 'set',
  workoutId: 'workout',
  planStep: 0,
  counterVersion: '1.0.0',
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
  // Typed wide: the fake moves through every status.
  const status: { status: VideoPlayerStatus } = { status: 'loading' };
  const on: Partial<VideoPlayerEvents> = {};
  const player = {
    file,
    /** Files loaded since it was made: each one blanks the picture while it loads. */
    loads: 0,
    playing: false,
    duration: 0,
    currentTime: 0,
    ...status,
    play: () => void (player.playing = true),
    pause: () => void (player.playing = false),
    seekBy: (seconds: number) => void (player.currentTime += seconds),
    replaceAsync: (source: VideoSource) => {
      // The reel only ever passes a file's uri.
      Object.assign(player, {
        loads: player.loads + 1,
        file: typeof source === 'string' ? source : '',
        status: 'loading',
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
      player.status = 'readyToPlay';
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
    fail: () => {
      player.status = 'error';
      on.statusChange?.({ status: 'error' });
    },
  };
  return player;
}

function reel(missing: readonly string[] = []) {
  // As the screen makes them: the first holding the start, playing; the second the file after it.
  const players = [fake('a'), fake('b')] as const;
  players[0].play();
  // Files deleted since the reel was listed fail as the players are made, before the reel listens.
  for (const player of players) if (missing.includes(player.file)) player.status = 'error';
  const onProgress = vi.fn<(along: number, glide: boolean) => void>();
  const onUnavailable = vi.fn();
  const actor = createActor(reelPlayback, {
    input: { clips, players, start: { clip: 0, part: 0 }, onProgress, onUnavailable },
  }).start();
  const on = () => players.map(({ file, playing }) => (playing ? file : `(${file})`)).join(' ');
  return {
    players,
    actor,
    onProgress,
    onUnavailable,
    on,
    spot: () => actor.getSnapshot().context.spot,
  };
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

  it('passes over a missing file, the one it opens on included', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { on, spot } = reel(['a']);
    expect(on()).toBe('(c) b');
    expect(spot()).toEqual({ clip: 1, part: 0 });
  });

  it('passes over a missing waiting file when the one on screen ends', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { players, actor, on, spot } = reel();
    actor.send({ type: 'go', to: { clip: 1, part: 0 }, along: 0.5 });
    players[1].fail(); // the waiting player's file: c
    expect(on()).toBe('b (c)');
    players[0].load();
    players[0].end();
    expect(on()).toBe('a (b)');
    expect(spot()).toEqual({ clip: 0, part: 0 });
    players[0].load();
    actor.send({ type: 'go', to: { clip: 0, part: 0 }, along: 0.5 }); // not waiting on the failed load
    expect(players[0].currentTime).toBe(5);
  });

  it('stops once it has passed over every file, rather than round and round', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { players, actor } = reel(['a', 'b']);
    // Every other file fails as it loads.
    for (let i = 0; i < 10; i++) players[actor.getSnapshot().context.front].fail();
    expect(players.some(({ playing }) => playing)).toBe(false);
    // Each of the three files tried about once, not ten times.
    expect(players[0].loads + players[1].loads).toBeLessThanOrEqual(4);
  });

  it('stops listening to the players when it stops', () => {
    const { players, actor } = reel();
    actor.stop();
    expect(players.map((player) => player.listening())).toEqual([[], []]);
  });
});

it('closes safely when retention deletes the last clip during viewing', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const path = 'document/local/videos/saved-0.mp4';
  files.add(path);
  const steps = expand([{ rounds: 1, steps: [{ exercise: 'pushup', goal: reps(10) }] }]);
  const kept = [keptSet('workout', 10, { id: 'saved' })];
  const source = openReel(dayReel(steps, kept, videoIndex()), { clip: 0, part: 0 });
  const players = [fake(source.first), fake(source.next)] as const;
  const onUnavailable = vi.fn();
  const actor = createActor(reelPlayback, {
    input: {
      clips: source.clips,
      start: source.start,
      players,
      onProgress: () => {},
      onUnavailable,
    },
  }).start();
  try {
    players[0].play();
    players[0].load();
    // The live catalog loses every video; playback still owns the sources from when it opened.
    deleteVideos(['saved']);
    expect(dayReel(steps, kept, videoIndex())).toEqual([]);
    // The same source calculation used by useReel still resolves the opened list, not the live one.
    expect(openReel(source.clips, source.start).first).toBe(path);
    players[0].fail();
    players[1].fail();
    expect(actor.getSnapshot().status).toBe('done');
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith({ clip: 0, part: 0 });
    expect(players.some(({ playing }) => playing)).toBe(false);
  } finally {
    actor.stop();
  }
});

it('keeps playback positions when new clips arrive and skips a deleted waiting source', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const folder = 'document/local/videos';
  files.add(`${folder}/first-0.mp4`);
  files.add(`${folder}/second-0.mp4`);
  const steps = expand([{ rounds: 3, steps: [{ exercise: 'pushup', goal: reps(10) }] }]);
  const kept = [
    keptSet('workout', 10, { id: 'new', planStep: 0 }),
    keptSet('workout', 10, { id: 'first', planStep: 1, startedAt: 1 }),
    keptSet('workout', 10, { id: 'second', planStep: 2, startedAt: 2 }),
  ];
  const source = openReel(dayReel(steps, kept, videoIndex()), { clip: 0, part: 0 });
  const players = [fake(source.first), fake(source.next)] as const;
  const onUnavailable = vi.fn();
  const actor = createActor(reelPlayback, {
    input: {
      clips: source.clips,
      start: source.start,
      players,
      onProgress: () => {},
      onUnavailable,
    },
  }).start();
  try {
    players[0].play();
    players[0].load();
    expect(players.map((player) => player.file)).toEqual([
      `${folder}/first-0.mp4`,
      `${folder}/second-0.mp4`,
    ]);
    files.add(`${folder}/new-0.mp4`);
    deleteVideos(['second']);
    expect(dayReel(steps, kept, videoIndex()).map((clip) => clip.set)).toEqual([0, 1]);
    players[1].fail();
    players[0].end();
    // The missing second file is passed over, and the original first clip keeps its position.
    expect(actor.getSnapshot().context.spot).toEqual({ clip: 0, part: 0 });
    expect(players[0].file).toBe(`${folder}/first-0.mp4`);
    expect(actor.getSnapshot().context.clips[0].set).toBe(1);
    expect(onUnavailable).not.toHaveBeenCalled();
  } finally {
    actor.stop();
  }
});
