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

  private fun create(): PoseLandmarker {
    val context = NitroModules.applicationContext ?: error("React context not ready")
    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
      .setBaseOptions(
        BaseOptions.builder()
          .setModelAssetPath("pose_landmarker_full.task")
          .setDelegate(Delegate.CPU) // shortcut: CPU for reliability; try GPU if frame time is too high.
          .build(),
      )
      // VIDEO mode tracks the body between frames (smoother, fewer jumps) and stays synchronous.
      .setRunningMode(RunningMode.VIDEO)
      .setNumPoses(1)
      .build()
    return PoseLandmarker.createFromOptions(context, options)
  }

  private var lastTimestampMs = 0L

  // Publish both sets and their coordinate mapping together; JS reads without blocking inference.
  @Volatile private var latestResult: PoseDetection? = null
  override val result: PoseDetection? get() = latestResult

  @Synchronized
  override fun detect(frame: HybridFrameSpec) {
    if (closed) return

    try {
      val proxy = (frame as? NativeFrame)?.image
      if (proxy == null) {
        latestResult = null
        return warnOnce("frame is not a NativeFrame")
      }
      if (proxy.format != PixelFormat.RGBA_8888) {
        latestResult = null
        return warnOnce("expected RGBA frames (pixelFormat 'rgb'), got format ${proxy.format}")
      }
      // CameraX timestamps are nanoseconds; VIDEO requires strictly increasing milliseconds.
      val ts = maxOf(proxy.imageInfo.timestamp / 1_000_000, lastTimestampMs + 1)
      lastTimestampMs = ts
      val detector = landmarker ?: create().also { landmarker = it }
      // CameraX RGBA proxies have no media.Image. MPImage.close() also recycles this Bitmap.
      val detected = BitmapImageBuilder(proxy.toBitmap()).build().use { image ->
        detector.detectForVideo(
          image,
          ImageProcessingOptions.builder().setRotationDegrees(proxy.imageInfo.rotationDegrees).build(),
          ts,
        )
      }
      val pose = detected.landmarks().firstOrNull()
      val world = detected.worldLandmarks().firstOrNull()
      val landmarks = pose?.map {
        PoseLandmark(it.x().toDouble(), it.y().toDouble(), it.z().toDouble(), it.visibility().orElse(0f).toDouble())
      }?.toTypedArray() ?: emptyArray()
      val worldLandmarks = world?.map {
        PoseLandmark(it.x().toDouble(), it.y().toDouble(), it.z().toDouble(), it.visibility().orElse(0f).toDouble())
      }?.toTypedArray() ?: emptyArray()
      // Rotation options affect inference, but MediaPipe projects results back to the raw bitmap.
      // Sensor coordinates let the preview apply its own rotation, mirroring, crop and letterboxing.
      val cameraLandmarks = landmarks.map {
        val point = frame.convertFramePointToCameraPoint(Point(it.x * proxy.width, it.y * proxy.height))
        PoseCameraPoint(point.x, point.y)
      }.toTypedArray()
      latestResult = PoseDetection(
        timestampMs = ts.toDouble(),
        landmarks = landmarks,
        worldLandmarks = worldLandmarks,
        cameraLandmarks = cameraLandmarks,
      )
    } catch (e: Exception) {
      latestResult = null
      Log.e(TAG, "detect failed", e)
    }
  }

  @Synchronized
  override fun close() {
    if (closed) return
    closed = true
    latestResult = null
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
