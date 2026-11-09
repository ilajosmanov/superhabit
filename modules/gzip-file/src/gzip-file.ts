import { NitroModules } from 'react-native-nitro-modules';

import type { GzipFile } from './gzip-file.nitro';

/** Gzips `bytes` into the file at `uri` off the JS thread; see `GzipFile.write`. */
export const writeGzip = (bytes: ArrayBuffer, uri: string) =>
  NitroModules.createHybridObject<GzipFile>('GzipFile').write(bytes, uri);
