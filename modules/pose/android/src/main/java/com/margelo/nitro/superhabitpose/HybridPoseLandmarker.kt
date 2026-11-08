package com.margelo.nitro.superhabitpose

import android.content.Context
import android.graphics.PixelFormat
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.view.Display
import android.view.Surface
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
import kotlin.math.sqrt

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

  // The phone's gravity in its own axes (x right, y up, z out of the screen), m/s². It reads "up":
  // the sensor feels the push back against gravity.
  @Volatile private var gravity: FloatArray? = null
  private var sensors: SensorManager? = null
  private var displays: DisplayManager? = null
  private val gravityListener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
      gravity = event.values.copyOf(3)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
  }

  // The fused gravity sensor ignores the phone's own shakes; a still phone's accelerometer reads the same.
  private fun startGravity() {
    val manager = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
    val registered = listOf(Sensor.TYPE_GRAVITY, Sensor.TYPE_ACCELEROMETER).any { type ->
      manager.getDefaultSensor(type)?.let { manager.registerListener(gravityListener, it, SensorManager.SENSOR_DELAY_GAME) } == true
    }
    if (!registered) {
      Log.w(TAG, "no gravity sensor: positions judge shape alone")
      return
    }
    sensors = manager
    displays = NitroModules.applicationContext?.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
  }

  /**
   * Down in the frame of the landmarks (x right, y down, z away from the camera), unit length. The
   * camera follows the interface, which the workout locks to landscape for floor work, so the
   * landmarks are upright to the screen: gravity turns with the display's rotation too. The back camera
   * looks out of the screen's back, the front one out of its face: unmirrored, that flips x and z.
   * World z points toward the camera, not away as MediaPipe's docs say: measured on front-camera clips,
   * only this sign puts a body lying flat, and kneeling knees, at the wrists' height.
   * shortcut: the back camera's z follows from that, unmeasured; record one back-camera clip lying flat.
   * shortcut: reads the display's rotation now, not the frame's; during a screen flip a frame or two
   * can disagree. Tie it to `rotationDegrees` if flips mid-set show wrong positions.
   */
  private fun down(front: Boolean): PoseVector? {
    val g = gravity ?: return null
    val n = sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2])
    if (n < 1f) return null
    // "Up" in the screen's axes (x right, y up), as in Android's accelerometer sample.
    val (x, y) = when (displays?.getDisplay(Display.DEFAULT_DISPLAY)?.rotation) {
      Surface.ROTATION_90 -> Pair(-g[1], g[0])
      Surface.ROTATION_180 -> Pair(-g[0], -g[1])
      Surface.ROTATION_270 -> Pair(g[1], -g[0])
      else -> Pair(g[0], g[1])
    }
    val sign = if (front) -1f else 1f
    return PoseVector((-sign * x / n).toDouble(), (y / n).toDouble(), (-sign * g[2] / n).toDouble())
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
  override fun detect(frame: HybridFrameSpec, front: Boolean) {
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
      val detector = landmarker ?: createDetector()?.also {
        landmarker = it
        startGravity()
      } ?: return
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
          down = down(front).also { lastDown = it },
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
    sensors?.unregisterListener(gravityListener)
    sensors = null
    displays = null
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

  private var lastDown: PoseVector? = null
  private var windowStart = 0L
  private var frames = 0
  private var busyNs = 0L

  // Read with `adb logcat -s PoseLandmarker`: results per second, time per frame (copy + inference),
  // and down: about (0, 1, 0) whenever the screen is upright, the phone standing or on its long edge.
  private fun logSpeed(ns: Long) {
    val now = System.nanoTime()
    if (frames == 0) windowStart = now - ns
    frames++
    busyNs += ns
    val elapsed = now - windowStart
    if (elapsed < 5_000_000_000L) return
    val d = lastDown?.let { "(%.2f, %.2f, %.2f)".format(it.x, it.y, it.z) } ?: "none"
    Log.i(TAG, "%.1f fps, %.1f ms/frame (%s), down %s".format(frames * 1e9 / elapsed, busyNs / 1e6 / frames, delegate, d))
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
