// A fake of expo-file-system's documents folder: file name -> text.
export const disk = new Map<string, string>();
/** Set `full` to make every write fail, like a phone with no space left. */
export const phone = { full: false };

export const Paths = { document: {} };

export class File {
  constructor(
    _dir: unknown,
    readonly name: string,
  ) {}
  get exists() {
    return disk.has(this.name);
  }
  textSync() {
    return disk.get(this.name) ?? '';
  }
  writeSync(text: string) {
    if (phone.full) throw new Error('No space left on device');
    disk.set(this.name, text);
  }
  copySync(to: File) {
    to.writeSync(this.textSync());
  }
  // Like the real one: an existing target is an error unless overwrite is asked for.
  moveSync(to: File, options?: { overwrite?: boolean }) {
    if (to.exists && !options?.overwrite) throw new Error(`${to.name} already exists`);
    disk.set(to.name, this.textSync());
    disk.delete(this.name);
  }
}
