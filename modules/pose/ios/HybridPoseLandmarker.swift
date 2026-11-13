import CoreMotion
import Foundation
import MediaPipeTasksVision
import NitroModules
import UIKit
import VisionCamera
import os

/// MediaPipe Pose Landmarker on VisionCamera frames: the iOS twin of `HybridPoseLandmarker.kt`, against the
/// same contract (`src/pose-landmarker.nitro.ts`). See that file for the reasoning behind each field.
class HybridPoseLandmarker: HybridPoseLandmarkerSpec {
  private let lock = NSLock()
  private var landmarker: PoseLandmarker?
  private var closed = false
  private var failed = false
  private var delegate: Delegate = .GPU
  private var detectFailures = 0

  // Nitro hands each call to the JS thread asynchronously, so inference never waits on JS.
  var onResult: ((PoseDetection) -> Void)?
  var onFailed: ((String) -> Void)?

  private func create(_ delegate: Delegate) throws -> PoseLandmarker {
    guard let path = Self.modelPath else {
      throw RuntimeError.error(withMessage: "pose_landmarker_full.task is missing from the app")
    }
    let options = PoseLandmarkerOptions()
    options.baseOptions.modelAssetPath = path
    options.baseOptions.delegate = delegate
    // VIDEO mode tracks the body between frames (smoother, fewer jumps) and stays synchronous.
    options.runningMode = .video
    options.numPoses = 1
    return try PoseLandmarker(options: options)
  }

  /// The model, shipped in the pod's own resource bundle (the same file as the Android asset).
  private static let modelPath: String? = {
    let here = Bundle(for: HybridPoseLandmarker.self)
    let bundle = here.url(forResource: "SuperhabitPose", withExtension: "bundle").flatMap(Bundle.init(url:))
    return (bundle ?? here).path(forResource: "pose_landmarker_full", ofType: "task")
      ?? Bundle.main.path(forResource: "pose_landmarker_full", ofType: "task")
  }()

  // MARK: Orientation

  /// Clockwise degrees the buffer is turned to be upright, as Android's `rotationDegrees`.
  private static func degrees(_ orientation: CameraOrientation) -> Int {
    switch orientation {
    case .up: return 0
    case .right: return 90
    case .down: return 180
    case .left: return 270
    }
  }

  private static func imageOrientation(_ degrees: Int, mirrored: Bool) -> UIImage.Orientation {
    switch degrees {
    case 90: return mirrored ? .rightMirrored : .right
    case 180: return mirrored ? .downMirrored : .down
    case 270: return mirrored ? .leftMirrored : .left
    default: return mirrored ? .upMirrored : .up
    }
  }

  /// Clockwise degrees a camera buffer turns to be upright on the screen. Both sensors are mounted landscape:
  /// the back one needs 90 in portrait (measured on an iPhone 13), 0 with the interface landscapeRight.
  /// shortcut: the front camera's values are the mirror of the back's by reasoning, not measured.
  private static func mountRotation(_ interface: UIInterfaceOrientation, front: Bool) -> Int {
    let back: Int
    switch interface {
    case .landscapeRight: back = 0
    case .portraitUpsideDown: back = 270
    case .landscapeLeft: back = 180
    default: back = 90
    }
    return front ? (360 - back) % 360 : back
  }

  /// Rotates a buffer point clockwise by `degrees` into the upright frame; `one` is 1 for normalized points,
  /// 0 for metres. MediaPipe answers in the buffer's own frame on iOS too (measured: a standing body's nose
  /// sat beside its hips, not above them), so this is Android's `upright` unchanged.
  private static func upright(_ x: Double, _ y: Double, degrees: Int, one: Double) -> (Double, Double) {
    switch degrees {
    case 90: return (one - y, x)
    case 180: return (one - x, one - y)
    case 270: return (y, one - x)
    default: return (x, y)
    }
  }

  // MARK: Gravity

  private var motion: CMMotionManager?
  private let motionQueue = OperationQueue()
  // "Up" in the phone's axes (x right, y up, z out of the screen), as Android's sensor reads it. iOS reports
  // gravity itself (toward the floor, in g), so it is negated.
  private var up: (Double, Double, Double)?
  private var interface: UIInterfaceOrientation = .portrait

  private func startGravity() {
    let manager = CMMotionManager()
    guard manager.isDeviceMotionAvailable else {
      // Positions need gravity to distinguish standing from lying down.
      reportFailure("no gravity sensor available")
      return
    }
    manager.deviceMotionUpdateInterval = 1.0 / 60
    manager.startDeviceMotionUpdates(to: motionQueue) { [weak self] data, _ in
      guard let self, let g = data?.gravity else { return }
      self.lock.lock()
      self.up = (-g.x, -g.y, -g.z)
      self.lock.unlock()
    }
    motion = manager
  }

  /// Reads the interface orientation on the main thread for the next frames.
  private func refreshInterface() {
    DispatchQueue.main.async { [weak self] in
      let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
      guard let self, let orientation = scene?.interfaceOrientation else { return }
      self.lock.lock()
      self.interface = orientation
      self.lock.unlock()
    }
  }

  /// Down in the landmarks' frame (x right, y down, z away from the camera), unit length, exactly as Android
  /// computes it. shortcut: the axes' signs were measured on Android; re-measure them on an iPhone.
  private func down(front: Bool) -> PoseVector? {
    guard let g = up else { return nil }
    let n = (g.0 * g.0 + g.1 * g.1 + g.2 * g.2).squareRoot()
    if n < 0.1 { return nil }
    // "Up" in the screen's axes (x right, y up). landscapeRight is Android's ROTATION_90.
    let (x, y): (Double, Double)
    switch interface {
    case .landscapeRight: (x, y) = (-g.1, g.0)
    case .portraitUpsideDown: (x, y) = (-g.0, -g.1)
    case .landscapeLeft: (x, y) = (g.1, -g.0)
    default: (x, y) = (g.0, g.1)
    }
    let sign: Double = front ? -1 : 1
    return PoseVector(x: -sign * x / n, y: y / n, z: g.2 / n)
  }

  // MARK: Timestamps

  private var lastTimestampMs = 0
  private var offsetMs = 0

  private func nextTimestampMs(_ rawMs: Int) -> Int {
    var ts = rawMs + offsetMs
    // MediaPipe needs strictly increasing timestamps and a flipped camera may start on an earlier clock.
    // Only a clock going backwards is rebased: a forward gap is real time the counters must see.
    if ts <= lastTimestampMs {
      offsetMs = lastTimestampMs + 33 - rawMs
      ts = rawMs + offsetMs
    }
    lastTimestampMs = ts
    return ts
  }

  /// Mean luma (BT.601), 0..255, of a GRID×GRID grid of pixels of a BGRA buffer.
  private static func brightness(_ buffer: CVPixelBuffer) -> Double {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    let rowStride = CVPixelBufferGetBytesPerRow(buffer)
    var sum = 0
    for row in 0..<grid {
      let rowStart = (2 * row + 1) * height / (2 * grid) * rowStride
      for col in 0..<grid {
        let i = rowStart + (2 * col + 1) * width / (2 * grid) * 4
        let b = Int(bytes[i]), g = Int(bytes[i + 1]), r = Int(bytes[i + 2])
        sum += (77 * r + 150 * g + 29 * b) >> 8
      }
    }
    return Double(sum) / Double(grid * grid)
  }

  // MARK: Detection

  func detect(frame: any HybridFrameSpec, front: Bool) throws {
    lock.lock()
    defer { lock.unlock() }
    if closed || failed { return }

    do {
      guard let native = frame as? NativeFrame, let sample = native.sampleBuffer,
        let pixels = CMSampleBufferGetImageBuffer(sample)
      else {
        return reportFailure("frame has no pixel buffer")
      }
      let format = CVPixelBufferGetPixelFormatType(pixels)
      if format != kCVPixelFormatType_32BGRA {
        return reportFailure("expected BGRA frames (pixelFormat 'rgb'), got format \(format)")
      }
      let ts = nextTimestampMs(Int(frame.timestamp * 1000))
      let started = DispatchTime.now().uptimeNanoseconds
      if landmarker == nil {
        landmarker = createDetector()
        if landmarker != nil { startGravity() }
      }
      guard let detector = landmarker, !failed else { return }
      refreshInterface()

      // VisionCamera's own orientation for this frame flips between 90 and 270 in a portrait-locked workout
      // (it follows the device orientation expo-screen-orientation fakes), though the buffer never turns. The
      // camera's mount and the interface give the real turn, as Android's rotationDegrees does.
      let reported = Self.degrees(frame.orientation)
      let rotation = Self.mountRotation(interface, front: front)
      let mirrored = frame.isMirrored
      if rotation != lastRotation || mirrored != lastMirrored {
        Self.log.info("rotation: \(rotation) (VisionCamera says \(reported)), mirrored: \(mirrored)")
        lastRotation = rotation
        lastMirrored = mirrored
      }
      let brightness = Self.brightness(pixels)
      let image = try MPImage(
        sampleBuffer: sample, orientation: Self.imageOrientation(rotation, mirrored: mirrored))
      let inferenceStart = DispatchTime.now().uptimeNanoseconds
      let detected = try detector.detect(videoFrame: image, timestampInMilliseconds: ts)
      let inferenceNs = DispatchTime.now().uptimeNanoseconds - inferenceStart
      detectFailures = 0

      let pose = detected.landmarks.first ?? []
      let world = detected.worldLandmarks.first ?? []
      // MediaPipe returns points in the unrotated buffer; the exercises expect the screen's frame (y down,
      // x right). The preview gets sensor coordinates below and rotates on its own.
      let landmarks = pose.map { point -> PoseLandmark in
        // A mirrored buffer (the front camera, if VisionCamera mirrors it) is unmirrored first, as Android's is.
        let rawX = mirrored ? 1 - Double(point.x) : Double(point.x)
        let (x, y) = Self.upright(rawX, Double(point.y), degrees: rotation, one: 1)
        return PoseLandmark(
          x: x, y: y, z: Double(point.z),
          visibility: point.visibility?.doubleValue ?? 0, presence: point.presence?.doubleValue)
      }
      // The contract keeps presence on image landmarks only.
      let worldLandmarks = world.map { point -> PoseLandmark in
        let rawX = mirrored ? -Double(point.x) : Double(point.x)
        let (x, y) = Self.upright(rawX, Double(point.y), degrees: rotation, one: 0)
        return PoseLandmark(
          x: x, y: y, z: Double(point.z), visibility: point.visibility?.doubleValue ?? 0, presence: nil)
      }
      let width = Double(CVPixelBufferGetWidth(pixels))
      let height = Double(CVPixelBufferGetHeight(pixels))
      // VisionCamera's iOS conversion counter-rotates by its own orientation, so it gets the point turned by
      // that same orientation (measured on an iPhone 13: the skeleton then lines up with the body).
      let cameraLandmarks = try pose.map { point -> PoseCameraPoint in
        let (x, y) = Self.upright(Double(point.x), Double(point.y), degrees: reported, one: 1)
        let camera = try frame.convertFramePointToCameraPoint(framePoint: Point(x: x * width, y: y * height))
        return PoseCameraPoint(x: camera.x, y: camera.y)
      }
      let sideways = rotation == 90 || rotation == 270
      let gravity = down(front: front)
      lastDown = gravity
      lastBrightness = brightness
      lastPresence = landmarks.first?.presence
      // Nose minus the hips' midpoint, upright: a standing body reads about (0, -0.3), and (0, -0.6) m in the world.
      if landmarks.count > 24 {
        let hx = (landmarks[23].x + landmarks[24].x) / 2, hy = (landmarks[23].y + landmarks[24].y) / 2
        lastNoseToHips = (landmarks[0].x - hx, landmarks[0].y - hy)
      } else {
        lastNoseToHips = nil
      }
      if worldLandmarks.count > 24 {
        let hx = (worldLandmarks[23].x + worldLandmarks[24].x) / 2
        let hy = (worldLandmarks[23].y + worldLandmarks[24].y) / 2
        lastWorldNoseToHips = (worldLandmarks[0].x - hx, worldLandmarks[0].y - hy)
      } else {
        lastWorldNoseToHips = nil
      }
      inferenceTotalNs += inferenceNs
      logSpeed(DispatchTime.now().uptimeNanoseconds - started)
      onResult?(
        PoseDetection(
          timestampMs: Double(ts),
          landmarks: landmarks,
          worldLandmarks: worldLandmarks,
          down: gravity,
          cameraLandmarks: cameraLandmarks,
          brightness: brightness,
          inferenceMs: Double(inferenceNs) / 1e6,
          frameWidth: sideways ? height : width,
          frameHeight: sideways ? width : height,
          rotation: Double(rotation),
          delegate: delegate == .GPU ? .gpu : .cpu
        ))
    } catch {
      Self.log.error("detect failed: \(error.localizedDescription)")
      detectFailures += 1
      if detectFailures < Self.maxDetectFailures { return }
      if delegate == .GPU {
        delegate = .CPU
        detectFailures = 0
        landmarker = nil
        do {
          landmarker = try create(.CPU)
          Self.log.warning("GPU inference failed, using CPU")
        } catch {
          reportFailure(error.localizedDescription)
        }
      } else {
        reportFailure(error.localizedDescription)
      }
    }
  }

  func close() throws {
    lock.lock()
    defer { lock.unlock() }
    if closed { return }
    closed = true
    onResult = nil
    onFailed = nil
    motion?.stopDeviceMotionUpdates()
    motion = nil
    landmarker = nil
  }

  deinit {
    motion?.stopDeviceMotionUpdates()
  }

  // GPU is faster and runs cooler over a whole workout; if it is refused, fall back to CPU.
  private func createDetector() -> PoseLandmarker? {
    do {
      let detector: PoseLandmarker
      do {
        detector = try create(.GPU)
      } catch {
        Self.log.warning("GPU delegate failed, using CPU: \(error.localizedDescription)")
        delegate = .CPU
        detector = try create(.CPU)
      }
      Self.log.info("delegate: \(self.delegate == .GPU ? "GPU" : "CPU")")
      return detector
    } catch {
      Self.log.error("detector creation failed: \(error.localizedDescription)")
      reportFailure(error.localizedDescription)
      return nil
    }
  }

  // MARK: Log

  private static let log = Logger(subsystem: "com.ilajosmanov.superhabit", category: "PoseLandmarker")
  private var lastRotation = -1
  private var lastMirrored = false
  private var lastDown: PoseVector?
  private var lastBrightness = 0.0
  private var lastPresence: Double?
  private var lastNoseToHips: (Double, Double)?
  private var lastWorldNoseToHips: (Double, Double)?
  private var windowStart: UInt64 = 0
  private var frames = 0
  private var busyNs: UInt64 = 0
  private var inferenceTotalNs: UInt64 = 0

  // Every 5 s, like Android's logcat line: fps, ms per frame, delegate, inference ms, brightness, the nose's
  // presence and down (about (0, 1, 0) whenever the screen is upright). Read it in Console.app.
  private func logSpeed(_ ns: UInt64) {
    let now = DispatchTime.now().uptimeNanoseconds
    if frames == 0 { windowStart = now - ns }
    frames += 1
    busyNs += ns
    let elapsed = now - windowStart
    if elapsed < 5_000_000_000 { return }
    let d = lastDown.map { String(format: "(%.2f, %.2f, %.2f)", $0.x, $0.y, $0.z) } ?? "none"
    let p = lastPresence.map { String(format: "%.2f", $0) } ?? "none"
    let nose = lastNoseToHips.map { String(format: "(%.2f, %.2f)", $0.0, $0.1) } ?? "none"
    let worldNose = lastWorldNoseToHips.map { String(format: "(%.2f, %.2f) m", $0.0, $0.1) } ?? "none"
    let line = String(
      format: "%.1f fps, %.1f ms/frame (%@), inference %.1f ms, brightness %.0f, presence %@, down %@, nose-hips %@, world %@",
      Double(frames) * 1e9 / Double(elapsed), Double(busyNs) / 1e6 / Double(frames),
      delegate == .GPU ? "GPU" : "CPU", Double(inferenceTotalNs) / 1e6 / Double(frames), lastBrightness, p, d, nose, worldNose)
    Self.log.info("\(line, privacy: .public)")
    frames = 0
    busyNs = 0
    inferenceTotalNs = 0
  }

  private func reportFailure(_ message: String) {
    if failed { return }
    failed = true
    Self.log.warning("\(message, privacy: .public)")
    onFailed?(message)
  }

  private static let grid = 32
  private static let maxDetectFailures = 3
}
