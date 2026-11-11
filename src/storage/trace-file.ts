// Trace v2 (`.sht`): one file per set, the only format from piece 2 on.
// gzip( "SHT2" · header length (uint32) · JSON header · time column · int16 columns ), little-endian.
// The time column holds int32 deltas in ms, so the first frame is time 0 and a long pause survives.
// Each int16 column holds round(value × scale) as wrap-around deltas from the previous frame (the first
// from 0); after undoing the deltas, −32768 means missing. A column whose values outgrow its default
// scale gets a smaller one for that file, recorded in the header; values are never clamped.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { Joint } from 'superhabit-pose/joints';
import { z } from 'zod';

const MAGIC = 'SHT2';
const MISSING = -32768;
const LARGEST = 32767;
/** The smallest scale a file may use, so every stored value decodes to a finite number. */
const MIN_SCALE = 1e-6;
/** Past this, halving a column's scale to fit the value could take it below MIN_SCALE. */
const MAX_ABS = LARGEST / MIN_SCALE / 2;

const JOINTS = Object.keys(Joint).map((name) => name.toLowerCase());
const IMAGE_AXES = ['x', 'y', 'z', 'visibility', 'presence'] as const;
const IMAGE_SCALES = [8000, 8000, 5000, 10000, 10000] as const;

/** Every int16 column in file order, with its default scale. */
const COLUMNS: readonly { name: string; scale: number }[] = [
  { name: 'person', scale: 1 },
  ...JOINTS.flatMap((joint) =>
    IMAGE_AXES.map((axis, a) => ({ name: `image.${joint}.${axis}`, scale: IMAGE_SCALES[a] })),
  ),
  // MediaPipe gives world points the same visibility as image points, so it is stored once.
  ...JOINTS.flatMap((joint) =>
    ['x', 'y', 'z'].map((axis) => ({ name: `world.${joint}.${axis}`, scale: 10000 })),
  ),
  ...['x', 'y', 'z'].map((axis) => ({ name: `down.${axis}`, scale: 10000 })),
  { name: 'phase', scale: 1 },
  { name: 'waiting', scale: 1 },
  { name: 'inferenceMs', scale: 100 },
  { name: 'brightness', scale: 100 },
];
const IMAGE = 1;
const WORLD = IMAGE + JOINTS.length * IMAGE_AXES.length;
const DOWN = WORLD + JOINTS.length * 3;
const PHASE = DOWN + 3;
const WAITING = PHASE + 1;
const INFERENCE = WAITING + 1;
const BRIGHTNESS = INFERENCE + 1;
/** Flags and list indices: always scale 1. */
const CATEGORICAL = [0, PHASE, WAITING];

export type TracePoint = readonly [x: number, y: number, z: number, visibility: number];
/** A frame's pose dots, `t` ms after the set's first frame. */
export type TraceFrame = {
  t: number;
  landmarks: readonly TracePoint[];
  world: readonly TracePoint[];
  /** Gravity in the world axes; absent in clips recorded without it. */
  down?: readonly [x: number, y: number, z: number];
};

/** One detector result as a set's trace keeps it. */
export type RecordedFrame = TraceFrame & {
  /** Per image point, how likely it is inside the frame; absent when the detector didn't say. */
  presence?: readonly number[];
  /** The counter's phase after this frame, and why it waits; null when not recorded. */
  phase: string | null;
  waiting: string | null;
  inferenceMs: number | null;
  /** Mean luma of the analysed frame, 0–255. */
  brightness: number | null;
};

const count = z.number().int().nonnegative();
const ms = z.number().nonnegative();
const headerSchema = z.strictObject({
  exercise: z.string(),
  setId: z.string(),
  counterVersion: z.string(),
  /** Where a converted public-dataset clip came from; its licence travels with it. */
  source: z
    .strictObject({ dataset: z.string(), clip: z.string(), url: z.string(), license: z.string() })
    .optional(),
  /** Null when the clip was recorded before devices were noted. */
  device: z
    .strictObject({
      model: z.string(),
      os: z.string(),
      delegate: z.enum(['gpu', 'cpu']).optional(),
    })
    .nullable(),
  /** Null when the clip was recorded before cameras were noted. */
  camera: z
    .strictObject({
      facing: z.enum(['front', 'back']),
      /** Frames per second over the set; null when it can't be measured (a single frame). */
      fps: z.number().positive().nullable(),
      /** The analysed frame's size in pixels, upright. */
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      mirrored: z.boolean(),
      /** Horizontal, in degrees; null when the camera doesn't report it. */
      fieldOfView: z.number().positive().nullable(),
    })
    .nullable(),
  /**
   * Filmed stretches, in the file's time, in order and not overlapping. Take i (its index here) is
   * filmed to `<setId>-<i>.mp4`; its video time is `t − videoAnchorMs`, null when the anchor is unknown.
   * Every attempted take keeps its index even if its file failed or is missing. Boundaries span the
   * trace frames from roll through cut; the anchor uses only frames after native recording started.
   */
  takes: z
    .array(z.strictObject({ startMs: ms, endMs: ms, videoAnchorMs: z.number().nullable() }))
    .refine(
      (takes) =>
        takes.every(
          ({ startMs, endMs }, i) => startMs <= endMs && (i === 0 || startMs >= takes[i - 1].endMs),
        ),
      'takes must each end after they start, in order, without overlapping',
    ),
  /** Session stages in file time; optional for v2 clips recorded before the recorder noted them. */
  stretches: z
    .array(
      z.strictObject({
        kind: z.enum(['countdown', 'waiting', 'counting', 'paused']),
        startMs: ms,
        endMs: ms,
      }),
    )
    .refine(
      (stretches) =>
        stretches.every(
          ({ startMs, endMs }, i) =>
            startMs <= endMs && (i === 0 || startMs >= stretches[i - 1].endMs),
        ),
      'stretches must each end after they start, in order, without overlapping',
    )
    .optional(),
  /** The consents in force at capture. */
  consent: z.array(z.string()),
  /** What the counter said at the end of the set. */
  counted: z.strictObject({
    reps: count.optional(),
    noReps: count.optional(),
    heldMs: ms.optional(),
  }),
  /** What a person checked by hand; kept apart from `counted`. */
  labels: z.strictObject({ reps: count.optional(), heldMs: ms.optional() }),
  /** Frames store an index into these. */
  phases: z.array(z.string()),
  waitingReasons: z.array(z.string()),
  frames: count,
  columns: z.array(z.strictObject({ name: z.string(), scale: z.number().min(MIN_SCALE) })),
});
export type TraceHeader = z.infer<typeof headerSchema>;
/** The header as the recorder fills it; the encoder adds the rest. */
export type TraceInfo = Omit<TraceHeader, 'phases' | 'waitingReasons' | 'frames' | 'columns'>;

/** Distinct names in order of first appearance, and each one's index (NaN for null). */
function names() {
  const index = new Map<string, number>();
  return {
    list: () => [...index.keys()],
    at(value: string | null) {
      if (value === null) return NaN;
      const at = index.get(value);
      if (at !== undefined) return at;
      // Past this an index no longer fits in int16 at scale 1.
      if (index.size > LARGEST) throw new Error(`trace: more than ${LARGEST + 1} distinct names`);
      index.set(value, index.size);
      return index.size - 1;
    },
  };
}

/** False for NaN, ±Infinity and values too large for any scale the file allows. */
const usable = (value: number) => Math.abs(value) <= MAX_ABS;
const allUsable = (values: readonly number[]) => values.every(usable);

/**
 * What a detector glitch leaves behind, so every file written decodes: a bad point drops the frame's
 * person, bad gravity or presence drops only that, a bad reading becomes null. One frame, never the set.
 */
function clean(frame: RecordedFrame): RecordedFrame {
  const person = frame.landmarks.every(allUsable) && frame.world.every(allUsable);
  const reading = (value: number | null) => (value !== null && usable(value) ? value : null);
  return {
    ...frame,
    landmarks: person ? frame.landmarks : [],
    world: person ? frame.world : [],
    presence: person && frame.presence && allUsable(frame.presence) ? frame.presence : undefined,
    down: frame.down && allUsable(frame.down) ? frame.down : undefined,
    inferenceMs: reading(frame.inferenceMs),
    brightness: reading(frame.brightness),
  };
}

/** One frame's column values in file order into `row`; NaN where missing. */
function fill(frame: RecordedFrame, phase: number, waiting: number, row: Float64Array) {
  row.fill(NaN);
  row[0] = frame.landmarks.length > 0 ? 1 : 0;
  frame.landmarks.forEach(([x, y, z, visibility], j) => {
    const at = IMAGE + j * IMAGE_AXES.length;
    row[at] = x;
    row[at + 1] = y;
    row[at + 2] = z;
    row[at + 3] = visibility;
    row[at + 4] = frame.presence?.[j] ?? NaN;
  });
  frame.world.forEach(([x, y, z], j) => {
    row[WORLD + j * 3] = x;
    row[WORLD + j * 3 + 1] = y;
    row[WORLD + j * 3 + 2] = z;
  });
  if (frame.down) [row[DOWN], row[DOWN + 1], row[DOWN + 2]] = frame.down;
  row[PHASE] = phase;
  row[WAITING] = waiting;
  row[INFERENCE] = frame.inferenceMs ?? NaN;
  row[BRIGHTNESS] = frame.brightness ?? NaN;
}

function checkFrame(frame: RecordedFrame, i: number, previous: number) {
  const ok = i === 0 ? frame.t === 0 : frame.t > previous && frame.t - previous <= 2 ** 31 - 1;
  if (!Number.isInteger(frame.t) || !ok)
    throw new Error(`frames[${i}].t: expected whole ms, 0 first, then strictly increasing`);
  const points = frame.landmarks.length;
  if ((points !== 0 && points !== JOINTS.length) || frame.world.length !== points)
    throw new Error(`frames[${i}]: expected 33 image and 33 world points, or none`);
  if (frame.presence && frame.presence.length !== points)
    throw new Error(`frames[${i}].presence: expected one per image point`);
}

const WIDTH = COLUMNS.length;
/** Frames per block of raw values: blocks grow a set's buffer without copying what it holds. */
const BLOCK = 256;

/**
 * A set's trace packed frame by frame as the set runs, so its end has no per-frame work but one
 * quantizing pass. `bytes(info)` is the whole file before gzip.
 */
export function traceBuilder() {
  const blocks: Float64Array[] = [];
  const times: number[] = [];
  /** Per column, the largest magnitude seen: the file's scale is chosen from it at the end. */
  const largest = new Float64Array(WIDTH);
  const phases = names();
  const reasons = names();

  return {
    get frames() {
      return times.length;
    },
    /** Throws on a frame the format can't hold, before keeping any of it. */
    add(recorded: RecordedFrame) {
      const i = times.length;
      checkFrame(recorded, i, times[i - 1]);
      const frame = clean(recorded);
      if (i % BLOCK === 0) blocks.push(new Float64Array(BLOCK * WIDTH));
      const at = (i % BLOCK) * WIDTH;
      const row = blocks[blocks.length - 1].subarray(at, at + WIDTH);
      fill(frame, phases.at(frame.phase), reasons.at(frame.waiting), row);
      for (let c = 0; c < WIDTH; c++)
        if (!Number.isNaN(row[c])) largest[c] = Math.max(largest[c], Math.abs(row[c]));
      times.push(frame.t);
    },
    bytes(info: TraceInfo): Uint8Array<ArrayBuffer> {
      const n = times.length;
      // Categorical columns never widen: names() keeps their values within int16.
      const columns = COLUMNS.map(({ name, scale }, c) => {
        while (Math.round(largest[c] * scale) > LARGEST) scale /= 2;
        return { name, scale };
      });
      // The header comes from our own code, so a schema error here is a bug: throw.
      const header = headerSchema.parse({
        ...info,
        phases: phases.list(),
        waitingReasons: reasons.list(),
        frames: n,
        columns,
      });
      const json = strToU8(JSON.stringify(header));
      const start = 8 + json.length;
      const values = start + 4 * n;
      const bytes = new Uint8Array(values + 2 * n * WIDTH);
      const view = new DataView(bytes.buffer);
      bytes.set(strToU8(MAGIC));
      view.setUint32(4, json.length, true);
      bytes.set(json, 8);
      for (let i = 0; i < n; i++)
        view.setInt32(start + 4 * i, times[i] - (times[i - 1] ?? 0), true);
      for (let c = 0; c < WIDTH; c++) {
        const scale = columns[c].scale;
        let previous = 0;
        for (let i = 0, at = values + 2 * c * n; i < n; i++, at += 2) {
          const value = blocks[(i / BLOCK) | 0][(i % BLOCK) * WIDTH + c];
          const q = Number.isNaN(value) ? MISSING : Math.round(value * scale);
          // setInt16 keeps the low 16 bits, so a delta between far-apart values wraps and still adds back.
          view.setInt16(at, q - previous, true);
          previous = q;
        }
      }
      return bytes;
    },
  };
}

export type TraceBuilder = ReturnType<typeof traceBuilder>;

/** A set's trace as a `.sht` file. A glitched value drops only what `clean` says. */
export function encodeTrace(info: TraceInfo, frames: readonly RecordedFrame[]): Uint8Array {
  const builder = traceBuilder();
  for (const frame of frames) builder.add(frame);
  return gzipSync(builder.bytes(info));
}

function parseHeader(bytes: Uint8Array): TraceHeader {
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(bytes));
  } catch (cause) {
    throw new Error('trace header: not JSON', { cause });
  }
  const parsed = headerSchema.safeParse(json);
  if (!parsed.success) throw new Error(`trace header: ${z.prettifyError(parsed.error)}`);
  const { columns } = parsed.data;
  const same =
    columns.length === COLUMNS.length &&
    COLUMNS.every(({ name }, c) => columns[c].name === name) &&
    CATEGORICAL.every((c) => columns[c].scale === 1);
  if (!same) throw new Error('trace header: columns differ from trace v2');
  return parsed.data;
}

/** A `.sht` file back into its header and frames; throws on anything but a whole, valid file. */
export function decodeTrace(file: Uint8Array): { header: TraceHeader; frames: RecordedFrame[] } {
  let bytes: Uint8Array;
  // fflate does not check the gzip CRC, so a flipped byte can decode as a plausible value: fine for tests
  // and tools, the only readers here. The server checks every upload (`readHeader`).
  try {
    bytes = gunzipSync(file);
  } catch (cause) {
    throw new Error('trace: not a whole gzip file', { cause });
  }
  if (bytes.length < 8 || strFromU8(bytes.subarray(0, 4)) !== MAGIC)
    throw new Error(`trace: no ${MAGIC} magic, not a trace v2 file`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const times = 8 + view.getUint32(4, true);
  if (times > bytes.length) throw new Error('trace: truncated header');
  const header = parseHeader(bytes.subarray(8, times));
  const n = header.frames;
  const width = COLUMNS.length;
  const values = times + 4 * n;
  if (bytes.length !== values + 2 * n * width)
    throw new Error(
      `trace: ${bytes.length - times} bytes of frames, ${n} frames need ${n * (4 + 2 * width)}`,
    );

  // Undo the deltas; an Int16Array keeps the low 16 bits, matching the encoder's wrap-around.
  const q = new Int16Array(n * width);
  for (let c = 0; c < width; c++)
    for (let i = 0; i < n; i++)
      q[c * n + i] =
        (i === 0 ? 0 : q[c * n + i - 1]) + view.getInt16(values + 2 * (c * n + i), true);
  // Finite: |q| ≤ 32767 and every scale is at least MIN_SCALE.
  const value = (c: number, i: number) =>
    q[c * n + i] === MISSING ? null : q[c * n + i] / header.columns[c].scale;
  const need = (c: number, i: number) => {
    const v = value(c, i);
    if (v === null) throw new Error(`trace: frames[${i}] has a person but no ${COLUMNS[c].name}`);
    return v;
  };
  /** All of a group, or none of it. */
  const group = (from: number, size: number, step: number, i: number) => {
    const got = Array.from({ length: size }, (_, k) => value(from + k * step, i)).filter(
      (v) => v !== null,
    );
    if (got.length === 0) return undefined;
    if (got.length < size)
      throw new Error(`trace: frames[${i}] has only part of ${COLUMNS[from].name}`);
    return got;
  };
  const named = (list: readonly string[], c: number, i: number) => {
    const at = value(c, i);
    if (at === null) return null;
    const name = list[at];
    if (name === undefined)
      throw new Error(`trace: frames[${i}] ${COLUMNS[c].name} ${at} is not listed`);
    return name;
  };

  let t = 0;
  return {
    header,
    frames: Array.from({ length: n }, (_, i): RecordedFrame => {
      const delta = view.getInt32(times + 4 * i, true);
      if (i === 0 ? delta !== 0 : delta <= 0)
        throw new Error(`trace: frames[${i}] time does not increase from 0`);
      t += delta;
      const person = value(0, i);
      if (person !== 0 && person !== 1) throw new Error(`trace: frames[${i}] person is ${person}`);
      const landmarks = person
        ? JOINTS.map((_, j): TracePoint => {
            const at = IMAGE + j * IMAGE_AXES.length;
            return [need(at, i), need(at + 1, i), need(at + 2, i), need(at + 3, i)];
          })
        : [];
      const world = landmarks.map(([, , , visibility], j): TracePoint => [
        need(WORLD + j * 3, i),
        need(WORLD + j * 3 + 1, i),
        need(WORLD + j * 3 + 2, i),
        visibility,
      ]);
      const presence = person ? group(IMAGE + 4, JOINTS.length, IMAGE_AXES.length, i) : undefined;
      const down = group(DOWN, 3, 1, i);
      return {
        t,
        landmarks,
        world,
        ...(presence && { presence }),
        ...(down && { down: [down[0], down[1], down[2]] satisfies TraceFrame['down'] }),
        phase: named(header.phases, PHASE, i),
        waiting: named(header.waitingReasons, WAITING, i),
        inferenceMs: value(INFERENCE, i),
        brightness: value(BRIGHTNESS, i),
      };
    }),
  };
}
