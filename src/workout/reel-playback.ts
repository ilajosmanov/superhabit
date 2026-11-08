import type { VideoPlayer } from 'expo-video';
import { assign, enqueueActions, fromCallback, setup } from 'xstate';

import { after, type Clip, type Spot } from './reel';

/** What the reel uses of an expo-video player. */
export type Player = Pick<
  VideoPlayer,
  'duration' | 'currentTime' | 'play' | 'pause' | 'seekBy' | 'replaceAsync' | 'addListener'
>;

type Events =
  | { type: 'go'; to: Spot; along: number } // jump to a file, `along` (0 to 1) into it
  | { type: 'ended'; i: number } // player i reached the end of its file
  | { type: 'loaded'; i: number; duration: number }
  | { type: 'played'; i: number; currentTime: number }
  | { type: 'failed'; i: number }; // player i could not load its file

type Input = {
  clips: readonly Clip[];
  /** The players, both made at mount: the first holding `start`, the second the file after it. */
  players: readonly [Player, Player];
  start: Spot;
  /** How far through the clip on screen, 0 to 1; `glide`: ease there over one time report. */
  onProgress: (along: number, glide: boolean) => void;
};

type Context = Omit<Input, 'start'> & {
  spot: Spot;
  /** The player on screen; the other holds the next file, loaded and waiting. */
  front: number;
  /** How far into a jumped-to file to start once it loads: a jump lands before its duration is known. */
  into: number;
};

const same = (a: Spot, b: Spot) => a.clip === b.clip && a.part === b.part;
const uri = (clips: readonly Clip[], { clip, part }: Spot) => clips[clip].takes[part];
const share = (clips: readonly Clip[], at: Spot, along: number) =>
  (at.part + along) / clips[at.clip].takes.length;

/** Each player's events, sent back tagged with which player it is. */
const listen = fromCallback<Events, readonly Player[], Events>(({ input: players, sendBack }) => {
  const subscriptions = players.flatMap((player, i) => [
    player.addListener('playToEnd', () => sendBack({ type: 'ended', i })),
    player.addListener('sourceLoad', ({ duration }) => sendBack({ type: 'loaded', i, duration })),
    player.addListener('timeUpdate', ({ currentTime }) =>
      sendBack({ type: 'played', i, currentTime }),
    ),
    player.addListener('statusChange', ({ status }) => {
      if (status === 'error') sendBack({ type: 'failed', i });
    }),
  ]);
  return () => subscriptions.forEach((subscription) => subscription.remove());
});

/**
 * Plays the reel's files one after another, back to the first after the last, on two players that take
 * turns: while one plays, the other holds the next file, so a file ends straight into the next one with
 * no blank player between them. `go` jumps; `loading` is a jumped-to file whose `currentTime` and
 * `duration` still belong to the old one.
 */
// Positional generics up to TInput (no type assertions allowed): children, actions, guards, delays, tags.
export const reelPlayback = setup<
  Context,
  Events,
  { listen: typeof listen },
  {},
  {
    advance: undefined;
    jump: undefined;
    seek: undefined;
    seekInto: undefined;
    went: undefined;
    played: undefined;
  },
  { front: undefined; here: undefined; onward: undefined },
  never,
  string,
  Input
>({
  actors: { listen },
  guards: {
    // Each player reports all the time; only the one on screen moves the reel.
    front: ({ context, event }) => 'i' in event && event.i === context.front,
    here: ({ context, event }) => event.type === 'go' && same(event.to, context.spot),
    onward: ({ context, event }) =>
      event.type === 'go' &&
      event.along === 0 &&
      same(event.to, after(context.clips, context.spot)),
  },
  actions: {
    // The waiting player already holds the next file: show it, and load the one after into the other.
    // A jump still loading is left behind: its seek must not land on the next file.
    advance: enqueueActions(({ context: { clips, players, spot, front, onProgress }, enqueue }) => {
      const next = after(clips, spot);
      enqueue(() => {
        players[1 - front].play();
        players[front].pause();
        onProgress(share(clips, next, 0), false);
        void players[front].replaceAsync(uri(clips, after(clips, next)));
      });
      enqueue.assign({ spot: next, front: 1 - front });
    }),
    jump: ({ context: { clips, players, front }, event }) => {
      if (event.type !== 'go') return;
      void players[front].replaceAsync(uri(clips, event.to));
      players[front].play();
      void players[1 - front].replaceAsync(uri(clips, after(clips, event.to)));
    },
    seek: ({ context: { players, front }, event }) => {
      const shown = players[front];
      if (event.type === 'go' && shown.duration > 0)
        shown.seekBy(event.along * shown.duration - shown.currentTime);
    },
    seekInto: ({ context: { players, front, into }, event }) => {
      if (event.type === 'loaded' && into > 0)
        players[front].seekBy(into * event.duration - players[front].currentTime);
    },
    went: ({ context: { clips, onProgress }, event }) => {
      if (event.type === 'go') onProgress(share(clips, event.to, event.along), false);
    },
    played: ({ context: { clips, players, front, spot, onProgress }, event }) => {
      const { duration } = players[front];
      if (event.type === 'played' && duration > 0)
        onProgress(share(clips, spot, Math.min(1, event.currentTime / duration)), true);
    },
  },
}).createMachine({
  context: ({ input: { start, ...input } }) => ({ ...input, spot: start, front: 0, into: 0 }),
  invoke: { src: 'listen', input: ({ context }) => context.players },
  initial: 'playing',
  on: {
    go: [
      { guard: 'onward', target: '.playing', actions: 'advance' },
      {
        target: '.loading',
        actions: ['jump', 'went', assign(({ event }) => ({ spot: event.to, into: event.along }))],
      },
    ],
    ended: { guard: 'front', target: '.playing', actions: 'advance' },
    played: { guard: 'front', actions: 'played' },
  },
  states: {
    playing: {
      on: { go: { guard: 'here', actions: ['seek', 'went'] } },
    },
    loading: {
      on: {
        // A scrub on while the file loads moves where it starts, so it resumes where the finger stopped.
        go: { guard: 'here', actions: [assign(({ event }) => ({ into: event.along })), 'went'] },
        loaded: { guard: 'front', target: 'playing', actions: 'seekInto' },
        // shortcut: skips a file that fails to load, once: a failure found on screen (a waiting file that
        // failed) stays black, and a drag held over a missing file reloads it on every move. Fine while a
        // file goes missing only by hand; check `status` before swapping in if that changes.
        failed: {
          guard: 'front',
          target: 'playing',
          actions: [() => console.warn('[reel] a file failed to load'), 'advance'],
        },
      },
    },
  },
});
