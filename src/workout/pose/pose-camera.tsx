import {
  Canvas,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  type SkCanvas,
  type SkPaint,
  type SkPoint,
} from '@shopify/react-native-skia';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  Camera,
  CommonResolutions,
  useAsyncRunner,
  useFrameOutput,
  useOrientation,
  type CameraRef,
  type CameraVideoOutput,
} from 'react-native-vision-camera';
import type { PoseDetection, PoseLandmarker } from 'superhabit-pose';

import { JOINTS, skeleton, type Dot, type Segment } from './skeleton';
import { MIN_VISIBILITY } from '@/exercises/body/geometry';
import { colors } from '@/theme';

/**
 * 33 entries in MediaPipe order, view coordinates; null where not visible enough or not finite.
 * The native transform includes the preview's cover scaling and, on the front camera, its mirroring.
 */
export function toViewJoints(preview: CameraRef | null, result: PoseDetection): (SkPoint | null)[] {
  const none = () => Array.from({ length: JOINTS }, () => null);
  if (!preview) return none();
  try {
    return Array.from({ length: JOINTS }, (_, i) => {
      const point = result.cameraLandmarks[i];
      if (!point || (result.landmarks[i]?.visibility ?? 0) < MIN_VISIBILITY) return null;
      const view = preview.convertCameraPointToViewPoint(point);
      return Number.isFinite(view.x) && Number.isFinite(view.y) ? view : null;
    });
  } catch {
    // CameraX has no sensor-to-view transform until the preview is ready.
    return none();
  }
}

// Bones and dots are drawn as one rounded rect or circle each: Skia's GPU backend draws those shapes
// directly, while one path of many strokes or circles is painted on the CPU and uploaded as a texture
// every frame, which kept the UI thread busy enough to freeze the overlay.

function paint(color: string, opacity: number, stroke?: number): SkPaint {
  'worklet';
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setAlphaf(opacity);
  if (stroke !== undefined) {
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(stroke);
    p.setStrokeCap(StrokeCap.Round);
  }
  return p;
}

/**
 * Each bone as a round-capped bar: a rotated rounded rect. A dimmed set is drawn opaque into a layer
 * that is faded as a whole, so bones that overlap don't add up brighter.
 */
function bones(
  canvas: SkCanvas,
  segs: readonly Segment[],
  width: number,
  color: string,
  opacity = 1,
) {
  'worklet';
  if (segs.length === 0) return;
  const half = width / 2;
  const p = paint(color, 1);
  if (opacity < 1) canvas.saveLayer(paint(color, opacity));
  for (const [a, b] of segs) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    canvas.save();
    canvas.translate(a.x, a.y);
    canvas.rotate((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, 0, 0);
    const rect = { x: -half, y: -half, width: length + width, height: width };
    canvas.drawRRect({ rect, rx: half, ry: half }, p);
    canvas.restore();
  }
  if (opacity < 1) canvas.restore();
}

/** All fills first, then all outlines, so a later dot never covers an earlier dot's ring. */
function dots(canvas: SkCanvas, all: readonly Dot[], fill: SkPaint, outline: SkPaint) {
  'worklet';
  for (const { x, y, r } of all) canvas.drawCircle(x, y, r, fill);
  for (const { x, y, r } of all) canvas.drawCircle(x, y, r, outline);
}

/** A camera filling its parent, feeding every frame to the landmarker, with the skeleton drawn over it. */
export function PoseCamera({
  cameraRef,
  landmarker,
  isActive,
  joints,
  highlight,
  tone,
  video,
  camera,
  showSkeleton,
  onReady,
  onVideoLost,
  onCameraFailed,
}: {
  cameraRef: RefObject<CameraRef | null>;
  landmarker: PoseLandmarker | null;
  isActive: boolean;
  /** Drawn by Skia on the UI thread straight from this shared value. */
  joints: SharedValue<(SkPoint | null)[]>;
  /** [a, vertex, c] of the measured angle; drawn thicker, with an angle arc at the vertex. */
  highlight: SharedValue<readonly [number, number, number] | null>;
  /** 'idle' = grey skeleton (waiting), 'live' = chalk bones + amber joints, 'noRep' = the highlighted limb red. */
  tone: 'idle' | 'live' | 'noRep';
  /** Extra output for filming sets; the session drops it after `onVideoLost` so tracking keeps working without it. */
  video?: CameraVideoOutput;
  /** Switching reconfigures the session; VisionCamera picks the default device at that position. */
  camera: 'front' | 'back';
  /** Off skips drawing only: detection and the shared values keep running for the gauge. */
  showSkeleton: boolean;
  /** The preview streams frames, on start and again once a camera switch has rebound the session. */
  onReady: () => void;
  /** The video output was dropped after a camera error: nothing more can be filmed. */
  onVideoLost: () => void;
  /** The camera failed with no video left to drop: counting can't go on until it is mounted again. */
  onCameraFailed: () => void;
}) {
  const asyncRunner = useAsyncRunner();
  // VisionCamera caches the preview's sensor-to-view matrix and refreshes it only on layout. A 180°
  // flip changes no size, so the skeleton would draw upside down: a 1dp taller box forces the relayout.
  // shortcut: works around VisionCamera 5.2.4's HybridPreviewView; drop once it refreshes on display change.
  // shortcut: a 180° flip mid-take leaves the rest of that file upside down (CameraX sets the muxer
  // orientation once per file); roll a new take on the flip if people film that way.
  const interfaceOrientation = useOrientation('interface');
  const relayout = interfaceOrientation === 'left' || interfaceOrientation === 'down';
  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'rgb', // CameraX converts to RGBA; the native detector copies it to a Bitmap.
    onFrame(frame) {
      'worklet';
      // runAsync returns false while the runner is busy; then this frame is dropped here.
      const accepted =
        landmarker !== null &&
        asyncRunner.runAsync(() => {
          'worklet';
          // The runner only clears its busy flag when this task returns normally, so never throw.
          // Results reach JS through the detector's native onResult callback, not across runtimes.
          // No `finally`: React Compiler skips any component that uses one.
          try {
            landmarker.detect(frame, camera === 'front');
          } catch (error) {
            console.error('[pose] frame processing failed', error);
          }
          frame.dispose();
        });
      if (!accepted) frame.dispose();
    },
  });

  // One UI-thread pass per pose records the whole skeleton as a picture.
  const picture = useDerivedValue(() => {
    const shape = skeleton(joints.get(), highlight.get());
    const idle = tone === 'idle';
    const dot = idle ? colors.subtle : colors.accent;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording();
    bones(canvas, shape.far, 3, colors.chalk, idle ? 0.3 : 0.45);
    bones(canvas, shape.near, 3, colors.chalk, idle ? 0.5 : 1);
    const limb = tone === 'noRep' ? colors.warn : colors.chalk;
    bones(canvas, shape.limb, idle ? 3 : 4, limb, idle ? 0.5 : 1);
    if (tone === 'live' && shape.arc) {
      const { x, y, r, start, sweep } = shape.arc;
      const oval = Skia.XYWHRect(x - r, y - r, r * 2, r * 2);
      canvas.drawArc(oval, start, sweep, false, paint(colors.accent, 1, 2.5));
    }
    const outline = paint(colors.ground, 1, 2.5);
    dots(canvas, shape.dots, paint(dot, 1), outline);
    dots(canvas, shape.limbDots, paint(tone === 'noRep' ? colors.warn : dot, 1), outline);
    return recorder.finishRecordingAsPicture();
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        ref={cameraRef}
        // Bottom only: the top-left origin stays the Canvas's, so view points still line up.
        style={[StyleSheet.absoluteFill, relayout && { bottom: -1 }]}
        device={camera}
        isActive={isActive}
        orientationSource="interface"
        resizeMode="cover"
        outputs={video ? [frameOutput, video] : [frameOutput]}
        onPreviewStarted={onReady}
        // Not every device binds preview + frames + video at once; CameraX then fails the whole configure.
        // shortcut: any camera error drops video for the rest of the session, even after a flip to a camera
        // that might bind it; reset it (and the camcorder) if that matters. One without video is the camera
        // itself failing.
        onError={(error) => {
          console.error('[camera]', error);
          if (video) onVideoLost();
          else onCameraFailed();
        }}
      />
      {showSkeleton && (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Picture picture={picture} />
        </Canvas>
      )}
    </View>
  );
}
