package com.margelo.nitro.reprepgopose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
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
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
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
  private var detectFailures = 0

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
      // While it tracks, MediaPipe looks for the person again only when this score drops under the
      // limit. At its default 0.5 a track that went wrong (an arm over the lens, then a step back)
      // survived for seconds as an upside-down skeleton. Replaying a device video: 0.7 cut those
      // frames from 149 to 23 and lost none of the real ones; 0.8 began losing a body close to the lens.
      .setMinPosePresenceConfidence(0.7f)
      .build()
    return PoseLandmarker.createFromOptions(context, options)
  }

  private var lastRotation = -1

  /** A normalized point of the upright picture, back in the sensor's buffer that needs `degrees` clockwise to be upright. */
  private fun inBuffer(
    x: Float,
    y: Float,
    degrees: Int
  ): Pair<Float, Float> =
    when (degrees) {
      90 -> Pair(y, 1f - x)
      180 -> Pair(1f - x, 1f - y)
      270 -> Pair(1f - y, x)
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

    override fun onAccuracyChanged(
      sensor: Sensor?,
      accuracy: Int
    ) {}
  }

  // The fused gravity sensor ignores the phone's own shakes; a still phone's accelerometer reads the same.
  private fun startGravity() {
    val manager = NitroModules.applicationContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    if (manager == null) {
      reportFailure("gravity sensor service is unavailable")
      return
    }
    val registered = listOf(Sensor.TYPE_GRAVITY, Sensor.TYPE_ACCELEROMETER).any { type ->
      manager.getDefaultSensor(type)?.let { manager.registerListener(gravityListener, it, SensorManager.SENSOR_DELAY_GAME) } == true
    }
    if (!registered) {
      // Positions need gravity to distinguish standing from lying down.
      reportFailure("no gravity sensor registered")
      return
    }
    sensors = manager
    displays = NitroModules.applicationContext?.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
  }

  /**
   * Down in the frame of the landmarks (x right, y down, z away from the camera), unit length. The
   * camera follows the interface, which the workout locks to landscape for floor work, so the
   * landmarks are upright to the screen: gravity turns with the display's rotation too. The back camera
   * looks out of the screen's back, the front one out of its face: unmirrored, that flips x.
   * z is the same for both: on front-camera clips only this sign puts a body lying flat, and kneeling
   * knees, at the wrists' height; on back-camera wall sits only this sign reads a back flat on the wall
   * as upright as the front camera does (64–70° otherwise). shortcut: the back camera's x is unmeasured.
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
    return PoseVector((-sign * x / n).toDouble(), (y / n).toDouble(), (g[2] / n).toDouble())
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

  /**
   * The frame as a bitmap turned upright. MediaPipe also takes the sensor's sideways frame with a
   * rotation option, but then it keeps losing a standing person and takes seconds to find them again.
   * Replaying a device video, 2101 frames: upright it found them in 1618, sideways in 1149 at 270°
   * (front camera) and 660 at 90° (back camera).
   */
  private fun uprightBitmap(proxy: ImageProxy): Bitmap {
    val raw = proxy.toBitmap()
    val rotation = proxy.imageInfo.rotationDegrees
    if (rotation == 0) return raw
    val turn = Matrix().apply { postRotate(rotation.toFloat()) }
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, turn, false).also { raw.recycle() }
  }

  /** Mean luma (BT.601), 0..255, of a GRID×GRID grid of pixels: 1024 reads instead of every pixel. */
  private fun brightness(proxy: ImageProxy): Double {
    val plane = proxy.planes[0]
    val buffer = plane.buffer
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    var sum = 0
    for (row in 0 until GRID) {
      val rowStart = (2 * row + 1) * proxy.height / (2 * GRID) * rowStride
      for (col in 0 until GRID) {
        val i = rowStart + (2 * col + 1) * proxy.width / (2 * GRID) * pixelStride
        val r = buffer.get(i).toInt() and 0xFF
        val g = buffer.get(i + 1).toInt() and 0xFF
        val b = buffer.get(i + 2).toInt() and 0xFF
        sum += (77 * r + 150 * g + 29 * b) shr 8
      }
    }
    return sum.toDouble() / (GRID * GRID)
  }

  // Nitro hands each call to the JS thread asynchronously, so inference never waits on JS.
  @Volatile override var onResult: ((result: PoseDetection) -> Unit)? = null

  @Volatile override var onFailed: ((message: String) -> Unit)? = null

  @Synchronized
  override fun detect(
    frame: HybridFrameSpec,
    front: Boolean
  ) {
    if (closed || failed) return

    try {
      val proxy = (frame as? NativeFrame)?.image
      if (proxy == null) {
        return reportFailure("frame is not a NativeFrame")
      }
      if (proxy.format != PixelFormat.RGBA_8888) {
        return reportFailure("expected RGBA frames (pixelFormat 'rgb'), got format ${proxy.format}")
      }
      val ts = nextTimestampMs(proxy.imageInfo.timestamp / 1_000_000)
      val started = System.nanoTime()
      val detector = landmarker ?: createDetector()?.also {
        landmarker = it
        startGravity()
      } ?: return
      if (failed) return
      val brightness = brightness(proxy)
      var inferenceNs = 0L
      val bitmap = uprightBitmap(proxy)
      val detected = try {
        BitmapImageBuilder(bitmap).build().use { image ->
          val inferenceStart = System.nanoTime()
          detector.detectForVideo(image, ts).also { inferenceNs = System.nanoTime() - inferenceStart }
        }
      } finally {
        bitmap.recycle()
      }
      detectFailures = 0
      val pose = detected.landmarks().firstOrNull()
      val world = detected.worldLandmarks().firstOrNull()

      // NormalizedLandmark and Landmark share no supertype, so both map through their fields.
      fun landmark(
        x: Float,
        y: Float,
        z: Float,
        visibility: Optional<Float>,
        presence: Optional<Float>
      ) = PoseLandmark(
        x.toDouble(),
        y.toDouble(),
        z.toDouble(),
        visibility.orElse(0f).toDouble(),
        if (presence.isPresent) presence.get().toDouble() else null
      )

      // The points come in the upright picture, the screen's frame the exercises expect (y down,
      // x right). The preview gets sensor coordinates below and rotates on its own.
      val rotation = proxy.imageInfo.rotationDegrees
      if (rotation != lastRotation) {
        Log.i(TAG, "rotation: $rotation")
        lastRotation = rotation
      }
      val landmarks = pose
        ?.map { landmark(it.x(), it.y(), it.z(), it.visibility(), it.presence()) }
        ?.toTypedArray() ?: emptyArray()
      // The contract keeps presence on image landmarks only.
      val worldLandmarks = world
        ?.map { landmark(it.x(), it.y(), it.z(), it.visibility(), Optional.empty()) }
        ?.toTypedArray() ?: emptyArray()
      // Sensor coordinates let the preview apply its own rotation, mirroring, crop and letterboxing.
      val cameraLandmarks = (pose ?: emptyList())
        .map {
          val (x, y) = inBuffer(it.x(), it.y(), rotation)
          val point = frame.convertFramePointToCameraPoint(Point(x.toDouble() * proxy.width, y.toDouble() * proxy.height))
          PoseCameraPoint(point.x, point.y)
        }.toTypedArray()
      val sideways = rotation == 90 || rotation == 270
      lastBrightness = brightness
      lastPresence = landmarks.firstOrNull()?.presence
      inferenceTotalNs += inferenceNs
      logSpeed(System.nanoTime() - started)
      onResult?.invoke(
        PoseDetection(
          timestampMs = ts.toDouble(),
          landmarks = landmarks,
          worldLandmarks = worldLandmarks,
          down = down(front).also { lastDown = it },
          cameraLandmarks = cameraLandmarks,
          brightness = brightness,
          inferenceMs = inferenceNs / 1e6,
          frameWidth = (if (sideways) proxy.height else proxy.width).toDouble(),
          frameHeight = (if (sideways) proxy.width else proxy.height).toDouble(),
          rotation = rotation.toDouble(),
          delegate = if (delegate == Delegate.GPU) PoseDelegate.GPU else PoseDelegate.CPU
        )
      )
    } catch (e: Exception) {
      Log.e(TAG, "detect failed", e)
      detectFailures++
      if (detectFailures < MAX_DETECT_FAILURES) return
      if (delegate == Delegate.GPU) {
        delegate = Delegate.CPU
        detectFailures = 0
        val detector = landmarker
        landmarker = null
        try {
          detector?.close()
          landmarker = create(Delegate.CPU)
          Log.w(TAG, "GPU inference failed, using CPU", e)
        } catch (fallback: Exception) {
          reportFailure(fallback.message ?: fallback.javaClass.simpleName)
        }
      } else {
        reportFailure(e.message ?: e.javaClass.simpleName)
      }
    }
  }

  @Synchronized
  override fun close() {
    if (closed) return
    closed = true
    onResult = null
    onFailed = null
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
  // shortcut: wrong output without an exception is undetected; add a device denylist if field reports show it.
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
      Log.e(TAG, "detector creation failed", e)
      reportFailure(e.message ?: e.javaClass.simpleName)
      return null
    }
  }

  private var lastDown: PoseVector? = null
  private var lastBrightness = 0.0
  private var lastPresence: Double? = null
  private var windowStart = 0L
  private var frames = 0
  private var busyNs = 0L
  private var inferenceTotalNs = 0L

  // Read with `adb logcat -s PoseLandmarker`: results per second, time per frame (copy + inference)
  // and in MediaPipe alone, the last frame's brightness (drops toward 0 with the lens covered), the
  // nose's presence ("none" without a body or when MediaPipe gives none), and down: about (0, 1, 0)
  // whenever the screen is upright, the phone standing or on its long edge.
  private fun logSpeed(ns: Long) {
    val now = System.nanoTime()
    if (frames == 0) windowStart = now - ns
    frames++
    busyNs += ns
    val elapsed = now - windowStart
    if (elapsed < 5_000_000_000L) return
    val d = lastDown?.let { "(%.2f, %.2f, %.2f)".format(it.x, it.y, it.z) } ?: "none"
    val p = lastPresence?.let { "%.2f".format(it) } ?: "none"
    Log.i(
      TAG,
      "%.1f fps, %.1f ms/frame (%s), inference %.1f ms, brightness %.0f, presence %s, down %s".format(
        frames * 1e9 / elapsed,
        busyNs / 1e6 / frames,
        delegate,
        inferenceTotalNs / 1e6 / frames,
        lastBrightness,
        p,
        d
      )
    )
    frames = 0
    busyNs = 0L
    inferenceTotalNs = 0L
  }

  private fun reportFailure(message: String) {
    if (failed) return
    failed = true
    Log.w(TAG, message)
    onFailed?.invoke(message)
  }

  companion object {
    private const val TAG = "PoseLandmarker"
    private const val GRID = 32
    private const val MAX_DETECT_FAILURES = 3
  }
}
