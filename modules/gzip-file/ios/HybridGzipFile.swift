import Foundation
import NitroModules
import zlib

/// Gzips bytes into a file off the JS thread; the Android file is the Kotlin twin.
class HybridGzipFile: HybridGzipFileSpec {
  func write(bytes: ArrayBuffer, uri: String) throws -> Promise<Void> {
    // A buffer from JS may only be read on the JS thread, so copy it before leaving.
    let data = bytes.toData(copyIfNeeded: true)
    return Promise.async {
      guard let url = URL(string: uri), url.isFileURL else {
        throw RuntimeError.error(withMessage: "not a file:// URI: \(uri)")
      }
      try Self.gzip(data).write(to: url, options: .atomic)
    }
  }

  /// One gzip member (deflate with a gzip header and trailer), at zlib's default level.
  private static func gzip(_ input: Data) throws -> Data {
    var stream = z_stream()
    // 15 + 16: the largest window, wrapped as gzip rather than zlib.
    guard deflateInit2_(
      &stream, Z_DEFAULT_COMPRESSION, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY,
      ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)
    ) == Z_OK else {
      throw RuntimeError.error(withMessage: "deflateInit2 failed")
    }
    defer { deflateEnd(&stream) }

    var output = Data(count: Int(deflateBound(&stream, uLong(input.count))))
    var status: Int32 = Z_OK
    input.withUnsafeBytes { (source: UnsafeRawBufferPointer) in
      output.withUnsafeMutableBytes { (target: UnsafeMutableRawBufferPointer) in
        stream.next_in = UnsafeMutablePointer(
          mutating: source.bindMemory(to: Bytef.self).baseAddress)
        stream.avail_in = uInt(input.count)
        stream.next_out = target.bindMemory(to: Bytef.self).baseAddress
        stream.avail_out = uInt(target.count)
        status = deflate(&stream, Z_FINISH)
      }
    }
    guard status == Z_STREAM_END else {
      throw RuntimeError.error(withMessage: "deflate failed (\(status))")
    }
    output.count = Int(stream.total_out)
    return output
  }
}
