package com.margelo.nitro.superhabitpose

import android.graphics.PixelFormat
import android.util.Log
import androidx.annotation.Keep
import androidx.camera.core.ImageProxy
import com.facebook.proguard.annotations.DoNotStrip
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.ByteBufferImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.Point
import com.margelo.nitro.camera.public.NativeFrame
import java.util.Optional

// Nitro finds this class by name at runtime, so R8 must not strip or rename it in release builds.
@DoNotStrip
@Keep
class HybridPoseLandmarker : HybridPoseLandmarkerSpec() {
  private var landmarker: PoseLandmarker? = null
  private var closed = false
  private var failed = false
  private var delegate = Delegate.GPU

  private fun create(delegate: Delegate): PoseLandmarker {
    val context = NitroModules.applicationContext ?: error("React context not ready")
    val options = PoseLandmarker.PoseLandmarkerOptions
      .builder()
      .setBaseOptions(
        BaseOptions
          .builder()
          .setModelAssetPath("pose_landmarker_full.task")
          .setDelegate(delegate)
          .build()
      )
      // VIDEO mode tracks the body between frames (smoother, fewer jumps) and stays synchronous.
      .setRunningMode(RunningMode.VIDEO)
      .setNumPoses(1)
      .build()
    return PoseLandmarker.createFromOptions(context, options)
  }

  private var lastRotation = -1

  /** Rotates a buffer point clockwise by `degrees` into the upright frame; `one` is 1 for normalized points, 0 for metres. */
  private fun upright(
    x: Float,
    y: Float,
    degrees: Int,
    one: Float
  ): Pair<Float, Float> =
    when (degrees) {
      90 -> Pair(one - y, x)
      180 -> Pair(one - x, one - y)
      270 -> Pair(y, one - x)
      else -> Pair(x, y)
    }

  private var lastTimestampMs = 0L
  private var offsetMs = 0L

  private fun nextTimestampMs(rawMs: Long): Long {
    var ts = rawMs + offsetMs
    // MediaPipe needs strictly increasing timestamps and a flipped camera may start on an earlier
    // clock. Only a clock going backwards is rebased: a forward gap is real time the counters must
    // see as a tracking break.
    if (ts <= lastTimestampMs) {
      offsetMs = lastTimestampMs + 33 - rawMs
      ts = rawMs + offsetMs
    }
    lastTimestampMs = ts
    return ts
  }

  private fun buildImage(proxy: ImageProxy): MPImage {
    val plane = proxy.planes[0]
    if (plane.rowStride != proxy.width * 4) {
      return BitmapImageBuilder(proxy.toBitmap()).build()
    }
    val buffer = plane.buffer.duplicate()
    buffer.rewind()
    return ByteBufferImageBuilder(buffer, proxy.width, proxy.height, MPImage.IMAGE_FORMAT_RGBA).build()
  }

  // Nitro hands each call to the JS thread asynchronously, so inference never waits on JS.
  @Volatile override var onResult: ((result: PoseDetection) -> Unit)? = null

  @Synchronized
  override fun detect(frame: HybridFrameSpec) {
    if (closed || failed) return

    try {
      val proxy = (frame as? NativeFrame)?.image
      if (proxy == null) {
        return warnOnce("frame is not a NativeFrame")
      }
      if (proxy.format != PixelFormat.RGBA_8888) {
        return warnOnce("expected RGBA frames (pixelFormat 'rgb'), got format ${proxy.format}")
      }
      val ts = nextTimestampMs(proxy.imageInfo.timestamp / 1_000_000)
      val started = System.nanoTime()
      val detector = landmarker ?: createDetector()?.also { landmarker = it } ?: return
      val detected = buildImage(proxy).use { image ->
        detector.detectForVideo(
          image,
          ImageProcessingOptions.builder().setRotationDegrees(proxy.imageInfo.rotationDegrees).build(),
          ts
        )
      }
      val pose = detected.landmarks().firstOrNull()
      val world = detected.worldLandmarks().firstOrNull()

      // NormalizedLandmark and Landmark share no supertype, so both map through their fields.
      fun landmark(
        x: Float,
        y: Float,
        z: Float,
        visibility: Optional<Float>
      ) = PoseLandmark(x.toDouble(), y.toDouble(), z.toDouble(), visibility.orElse(0f).toDouble())

      // MediaPipe returns points in the unrotated buffer; the exercises expect the screen's frame
      // (y down, x right). The preview gets sensor coordinates below and rotates on its own.
      val rotation = proxy.imageInfo.rotationDegrees
      if (rotation != lastRotation) {
        Log.i(TAG, "rotation: $rotation")
        lastRotation = rotation
      }
      val landmarks = pose
        ?.map {
          val (x, y) = upright(it.x(), it.y(), rotation, 1f)
          landmark(x, y, it.z(), it.visibility())
        }?.toTypedArray() ?: emptyArray()
      val worldLandmarks = world
        ?.map {
          val (x, y) = upright(it.x(), it.y(), rotation, 0f)
          landmark(x, y, it.z(), it.visibility())
        }?.toTypedArray() ?: emptyArray()
      // Rotation options affect inference, but MediaPipe projects results back to the raw image.
      // Sensor coordinates let the preview apply its own rotation, mirroring, crop and letterboxing.
      val cameraLandmarks = (pose ?: emptyList())
        .map {
          val point = frame.convertFramePointToCameraPoint(Point(it.x().toDouble() * proxy.width, it.y().toDouble() * proxy.height))
          PoseCameraPoint(point.x, point.y)
        }.toTypedArray()
      logSpeed(System.nanoTime() - started)
      onResult?.invoke(
        PoseDetection(
          timestampMs = ts.toDouble(),
          landmarks = landmarks,
          worldLandmarks = worldLandmarks,
          cameraLandmarks = cameraLandmarks
        )
      )
    } catch (e: Exception) {
      Log.e(TAG, "detect failed", e)
    }
  }

  @Synchronized
  override fun close() {
    if (closed) return
    closed = true
    onResult = null
    val detector = landmarker
    landmarker = null
    try {
      detector?.close()
    } catch (e: Exception) {
      Log.e(TAG, "close failed", e)
    }
  }

  override fun dispose() {
    close()
    super.dispose()
  }

  // GPU is faster and runs cooler over a whole workout; some drivers refuse it, so fall back to CPU.
  // shortcut: only catches a GPU that fails to start, not one that runs with wrong output; add a
  // device denylist if field reports show that.
  private fun createDetector(): PoseLandmarker? {
    try {
      val detector = try {
        create(Delegate.GPU)
      } catch (e: Exception) {
        Log.w(TAG, "GPU delegate failed, using CPU", e)
        delegate = Delegate.CPU
        create(Delegate.CPU)
      }
      Log.i(TAG, "delegate: $delegate")
      return detector
    } catch (e: Exception) {
      failed = true
      Log.e(TAG, "detector creation failed", e)
      return null
    }
  }

  private var windowStart = 0L
  private var frames = 0
  private var busyNs = 0L

  // Read with `adb logcat -s PoseLandmarker`: results per second and time per frame (copy + inference).
  private fun logSpeed(ns: Long) {
    val now = System.nanoTime()
    if (frames == 0) windowStart = now - ns
    frames++
    busyNs += ns
    val elapsed = now - windowStart
    if (elapsed < 5_000_000_000L) return
    Log.i(TAG, "%.1f fps, %.1f ms/frame (%s)".format(frames * 1e9 / elapsed, busyNs / 1e6 / frames, delegate))
    frames = 0
    busyNs = 0L
  }

  private var warned = false

  private fun warnOnce(message: String) {
    if (warned) return
    warned = true
    Log.w(TAG, message)
  }

  companion object {
    private const val TAG = "PoseLandmarker"
  }
}
