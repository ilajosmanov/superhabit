import type { VideoPlayer } from 'expo-video';
import { assign, enqueueActions, fromCallback, not, setup } from 'xstate';

import { after, type Clip, type Spot } from './reel';

/** What the reel uses of an expo-video player. */
export type Player = Pick<
  VideoPlayer,
  | 'duration'
  | 'currentTime'
  | 'status'
  | 'play'
  | 'pause'
  | 'seekBy'
  | 'replaceAsync'
  | 'addListener'
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
  /** Each player's file failed to load; cleared when the player gets another file. */
  broken: readonly boolean[];
  /** Files passed over as missing since a file last loaded; past every file, the reel stops trying. */
  skipped: number;
};

const same = (a: Spot, b: Spot) => a.clip === b.clip && a.part === b.part;
const uri = (clips: readonly Clip[], { clip, part }: Spot) => clips[clip].takes[part];
const share = (clips: readonly Clip[], at: Spot, along: number) =>
  (at.part + along) / clips[at.clip].takes.length;
/** Missing files to pass over on `event`: the one on screen if it failed, and the waiting one if it did. */
const missing = ({ broken, front }: Context, event: Events) =>
  (event.type === 'failed' ? 1 : 0) + (broken[1 - front] ? 1 : 0);

/** Loads `to` on screen, playing as soon as it can, and the file after it into the waiting player. */
function load({ clips, players, front }: Context, to: Spot) {
  void players[front].replaceAsync(uri(clips, to));
  players[front].play();
  void players[1 - front].replaceAsync(uri(clips, after(clips, to)));
}

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
  // A file that failed before the reel listened: a player loads its first file as it is made.
  players.forEach((player, i) => {
    if (player.status === 'error') sendBack({ type: 'failed', i });
  });
  return () => subscriptions.forEach((subscription) => subscription.remove());
});

/**
 * Plays the reel's files one after another, back to the first after the last, on two players that take
 * turns: while one plays, the other holds the next file, so a file ends straight into the next one with
 * no blank player between them. `go` jumps; `loading` is a jumped-to file whose `currentTime` and
 * `duration` still belong to the old one. A file that fails to load (deleted since the reel was listed) is
 * passed over; once every file has been, the reel stops where it is.
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
    passOver: undefined;
    mark: undefined;
    count: undefined;
    loadedOne: undefined;
    giveUp: undefined;
    seek: undefined;
    seekInto: undefined;
    went: undefined;
    played: undefined;
  },
  {
    front: undefined;
    here: undefined;
    onward: undefined;
    nextBroken: undefined;
    spent: undefined;
  },
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
      !context.broken[1 - context.front] &&
      same(event.to, after(context.clips, context.spot)),
    nextBroken: ({ context }) => context.broken[1 - context.front],
    spent: ({ context, event }) =>
      context.skipped + missing(context, event) >
      context.clips.reduce((n, clip) => n + clip.takes.length, 0),
  },
  actions: {
    // The waiting player already holds the next file: show it, and load the one after into the other.
    // A jump still loading is left behind: its seek must not land on the next file.
    advance: enqueueActions(
      ({ context: { clips, players, spot, front, broken, onProgress }, enqueue }) => {
        const next = after(clips, spot);
        enqueue(() => {
          players[1 - front].play();
          players[front].pause();
          onProgress(share(clips, next, 0), false);
          void players[front].replaceAsync(uri(clips, after(clips, next)));
        });
        enqueue.assign({
          spot: next,
          front: 1 - front,
          broken: [0, 1].map((i) => i !== front && broken[i]),
        });
      },
    ),
    jump: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'go') return;
      enqueue(() => load(context, event.to));
      enqueue.assign({ spot: event.to, into: event.along, broken: [false, false] });
    }),
    // The waiting file is missing: go to the one after it, as a jump.
    passOver: enqueueActions(({ context, event, enqueue }) => {
      const to = after(context.clips, after(context.clips, context.spot));
      enqueue(() => {
        console.warn('[reel] a file is missing');
        load(context, to);
        context.onProgress(share(context.clips, to, 0), false);
      });
      enqueue.assign({
        spot: to,
        into: 0,
        broken: [false, false],
        skipped: context.skipped + missing(context, event),
      });
    }),
    mark: assign({
      broken: ({ context, event }) =>
        context.broken.map((b, i) => b || ('i' in event && event.i === i)),
    }),
    count: assign({ skipped: ({ context }) => context.skipped + 1 }),
    loadedOne: assign({ skipped: 0 }),
    giveUp: ({ context: { players, front } }) => {
      console.warn('[reel] no file left to play');
      players[front].pause();
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
  context: ({ input: { start, ...input } }) => ({
    ...input,
    spot: start,
    front: 0,
    into: 0,
    broken: [false, false],
    skipped: 0,
  }),
  invoke: { src: 'listen', input: ({ context }) => context.players },
  initial: 'playing',
  on: {
    go: [
      { guard: 'onward', target: '.playing', actions: 'advance' },
      { target: '.loading', actions: ['jump', 'went'] },
    ],
    ended: [
      { guard: not('front') },
      { guard: 'spent', actions: 'giveUp' },
      { guard: 'nextBroken', target: '.loading', actions: 'passOver' },
      { target: '.playing', actions: 'advance' },
    ],
    // shortcut: a drag held over a missing file reloads it on every move; fine while files go missing only
    // by hand.
    failed: [
      { guard: not('front'), actions: 'mark' },
      { guard: 'spent', actions: 'giveUp' },
      { guard: 'nextBroken', target: '.loading', actions: 'passOver' },
      {
        target: '.playing',
        actions: [() => console.warn('[reel] a file is missing'), 'advance', 'count'],
      },
    ],
    loaded: { actions: 'loadedOne' },
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
        loaded: { guard: 'front', target: 'playing', actions: ['seekInto', 'loadedOne'] },
      },
    },
  },
});
