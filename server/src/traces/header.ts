// The start of a trace v2 file (the phone's `src/storage/trace-file.ts`):
// gzip( "SHT2" · header length (uint32, little-endian) · JSON header · frames ).
const MAGIC = [0x53, 0x48, 0x54, 0x32];
/** Far over a real header (the column list makes most of it) and a real set's frames. */
const MAX_HEADER = 1024 * 1024;
const MAX_INFLATED = 256 * 1024 * 1024;

/** What the server reads of a trace's header: whose set it is and the consents in force when it started. */
export type TraceHeader = { setId: string; consent: string[] };

/**
 * The header of a `.sht` file, or null when it isn't a whole, valid gzip holding a trace v2. The whole file
 * is inflated, so gzip's checksum catches a damaged one; only the header is kept.
 */
export async function readHeader(file: ArrayBuffer): Promise<TraceHeader | null> {
  const reader = new Blob([file]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  let start = new Uint8Array(0);
  // Where the header ends, once the first 8 bytes say.
  let end = Infinity;
  let inflated = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      inflated += value.length;
      if (inflated > MAX_INFLATED || (end !== Infinity && end > MAX_HEADER)) {
        await reader.cancel();
        return null;
      }
      if (start.length < end) {
        start = concat(start, value);
        if (start.length >= 8) end = 8 + new DataView(start.buffer).getUint32(4, true);
      }
    }
  } catch {
    return null;
  }
  if (start.length < 8 || start.length < end || MAGIC.some((byte, i) => start[i] !== byte)) {
    return null;
  }
  try {
    const header: unknown = JSON.parse(new TextDecoder().decode(start.subarray(8, end)));
    if (typeof header !== 'object' || header === null) return null;
    if (!('setId' in header && 'consent' in header)) return null;
    const { setId, consent } = header;
    if (typeof setId !== 'string' || !Array.isArray(consent)) return null;
    return { setId, consent: consent.filter((c) => typeof c === 'string') };
  } catch {
    return null;
  }
}

function concat(a: Uint8Array, b: Uint8Array) {
  const both = new Uint8Array(a.length + b.length);
  both.set(a);
  both.set(b, a.length);
  return both;
}
