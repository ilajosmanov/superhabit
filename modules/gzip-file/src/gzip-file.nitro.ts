import type { HybridObject } from 'react-native-nitro-modules';

export interface GzipFile extends HybridObject<{ android: 'kotlin'; ios: 'swift' }> {
  /**
   * Gzips `bytes` into the file at `uri` (a `file://` URI), replacing it, on a background thread.
   * The bytes are copied before the call returns, so the caller may reuse them.
   */
  write(bytes: ArrayBuffer, uri: string): Promise<void>;
}
