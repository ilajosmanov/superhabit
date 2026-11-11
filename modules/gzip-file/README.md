# gzip-file

Gzips bytes into a file on a background thread, so a set's trace is compressed and written without
blocking the JS thread. A Nitro module; Android only. The recorder (`src/workout/capture/recorder-file.ts`) is its
one caller.

| File                          | Does                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| `src/gzip-file.nitro.ts`      | the contract: `GzipFile.write(bytes, uri)`                                |
| `src/gzip-file.ts`            | the package entry: `writeGzip(bytes, uri)`                                |
| `android/…/HybridGzipFile.kt` | copies the bytes on the JS thread, then `GZIPOutputStream` on a coroutine |
| `nitrogen/generated/`         | generated from the contract; never edit by hand                           |

The output is plain gzip (the JDK's `java.util.zip`), which fflate's `gunzipSync` reads, so
`decodeTrace` works on a pulled file. The caller renames the written file into place.

After changing the contract, regenerate from this folder with the same Nitrogen as
`react-native-nitro-modules` (0.37.2): `vp dlx nitrogen@0.37.2`. Then rebuild the app (`vp run android`).
