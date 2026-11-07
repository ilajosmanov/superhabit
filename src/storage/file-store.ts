import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

/** How a store's value becomes the file's text and back. */
type Codec<T> = {
  empty: T;
  serialise: (value: T) => string;
  /** `complete` is false when any of the text could not be read, so the original is kept aside. */
  parse: (text: string) => { value: T; complete: boolean };
};

// shortcut: one JSON file read whole and rewritten whole on every change; fine for tens of records with a
// day list each. Move to expo-sqlite when history needs queries (stats over months) or sync.
/**
 * A value kept in `<name>.json` in the app's documents: read once, then served from memory. Every change
 * goes through `set`, which writes before anything sees the new value.
 */
export function fileStore<T>(name: string, codec: Codec<T>) {
  const file = () => new File(Paths.document, `${name}.json`);
  const aside = () => new File(Paths.document, `${name}.json.tmp`);
  let cache: { value: T } | null = null;
  const listeners = new Set<() => void>();

  /** Written aside, then moved over the old file, so a crash mid-write leaves the old one whole. */
  function write(value: T) {
    const draft = aside();
    draft.writeSync(codec.serialise(value));
    draft.moveSync(file(), { overwrite: true });
  }

  function get(): T {
    if (cache) return cache.value;
    const stored = file();
    // Android's overwriting move deletes the old file before renaming: a crash between leaves only the new
    // one. Put it back in place first, or the next write over the aside file could destroy the only copy.
    if (!stored.exists && aside().exists) aside().moveSync(stored);
    if (!stored.exists) return (cache = { value: codec.empty }).value;
    const read = codec.parse(stored.textSync());
    if (!read.complete) {
      // Keep what couldn't be read beside it, then store what could, so the next start reads a clean file.
      try {
        stored.copySync(new File(Paths.document, `${name}-${Date.now()}.unread.json`));
        write(read.value);
      } catch {
        // A full disk: the file is untouched, so the next start tries again. Reading must not crash.
      }
    }
    return (cache = { value: read.value }).value;
  }

  /** Store `value` and tell every subscriber; false, with nothing changed, when the phone can't write it. */
  function set(value: T): boolean {
    try {
      write(value);
    } catch {
      return false;
    }
    cache = { value };
    for (const listener of listeners) listener();
    return true;
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { get, set, use: () => useSyncExternalStore(subscribe, get) };
}
