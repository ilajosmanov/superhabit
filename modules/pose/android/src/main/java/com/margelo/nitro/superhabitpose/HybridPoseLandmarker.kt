package com.margelo.nitro.superhabitpose

import android.graphics.PixelFormat
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.Point
import com.margelo.nitro.camera.public.NativeFrame

class HybridPoseLandmarker : HybridPoseLandmarkerSpec() {
  private var landmarker: PoseLandmarker? = null
  private var closed = false
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

  private var lastTimestampMs = 0L

  // Nitro hands each call to the JS thread asynchronously, so inference never waits on JS.
  @Volatile override var onResult: ((result: PoseDetection) -> Unit)? = null

  @Synchronized
  override fun detect(frame: HybridFrameSpec) {
    if (closed) return

    try {
      val proxy = (frame as? NativeFrame)?.image
      if (proxy == null) {
        return warnOnce("frame is not a NativeFrame")
      }
      if (proxy.format != PixelFormat.RGBA_8888) {
        return warnOnce("expected RGBA frames (pixelFormat 'rgb'), got format ${proxy.format}")
      }
      // CameraX timestamps are nanoseconds; VIDEO requires strictly increasing milliseconds.
      val ts = maxOf(proxy.imageInfo.timestamp / 1_000_000, lastTimestampMs + 1)
      lastTimestampMs = ts
      val started = System.nanoTime()
      val detector = landmarker ?: createDetector().also { landmarker = it }
      // CameraX RGBA proxies have no media.Image. MPImage.close() also recycles this Bitmap.
      val detected = BitmapImageBuilder(proxy.toBitmap()).build().use { image ->
        detector.detectForVideo(
          image,
          ImageProcessingOptions.builder().setRotationDegrees(proxy.imageInfo.rotationDegrees).build(),
          ts
        )
      }
      val pose = detected.landmarks().firstOrNull()
      val world = detected.worldLandmarks().firstOrNull()
      val landmarks = pose
        ?.map {
          PoseLandmark(it.x().toDouble(), it.y().toDouble(), it.z().toDouble(), it.visibility().orElse(0f).toDouble())
        }?.toTypedArray() ?: emptyArray()
      val worldLandmarks = world
        ?.map {
          PoseLandmark(it.x().toDouble(), it.y().toDouble(), it.z().toDouble(), it.visibility().orElse(0f).toDouble())
        }?.toTypedArray() ?: emptyArray()
      // Rotation options affect inference, but MediaPipe projects results back to the raw bitmap.
      // Sensor coordinates let the preview apply its own rotation, mirroring, crop and letterboxing.
      val cameraLandmarks = landmarks
        .map {
          val point = frame.convertFramePointToCameraPoint(Point(it.x * proxy.width, it.y * proxy.height))
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
  private fun createDetector(): PoseLandmarker {
    val detector = try {
      create(Delegate.GPU)
    } catch (e: Exception) {
      Log.w(TAG, "GPU delegate failed, using CPU", e)
      delegate = Delegate.CPU
      create(Delegate.CPU)
    }
    Log.i(TAG, "delegate: $delegate")
    return detector
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
