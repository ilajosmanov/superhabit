package com.margelo.nitro.superhabitgzipfile

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.core.ArrayBuffer
import com.margelo.nitro.core.Promise
import java.io.File
import java.net.URI
import java.util.zip.GZIPOutputStream

@DoNotStrip
@Keep
class HybridGzipFile : HybridGzipFileSpec() {
  override fun write(
    bytes: ArrayBuffer,
    uri: String
  ): Promise<Unit> {
    // A buffer from JS may only be read on the JS thread, so copy it before leaving.
    val data = bytes.toByteArray()
    return Promise.async {
      GZIPOutputStream(File(URI(uri)).outputStream(), BUFFER).use { it.write(data) }
    }
  }

  private companion object {
    const val BUFFER = 64 * 1024
  }
}
