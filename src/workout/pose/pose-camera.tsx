import { Canvas, Path, Skia, select, type SkPoint } from '@shopify/react-native-skia';
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

function segments(segs: readonly Segment[]) {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  for (const [p, q] of segs) builder.moveTo(p.x, p.y).lineTo(q.x, q.y);
  return builder.detach();
}

function circles(dots: readonly Dot[]) {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  for (const { x, y, r } of dots) builder.addCircle(x, y, r);
  return builder.detach();
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
            landmarker.detect(frame);
          } catch (error) {
            console.error('[pose] frame processing failed', error);
          }
          frame.dispose();
        });
      if (!accepted) frame.dispose();
    },
  });

  // One UI-thread pass per pose builds every layer; `select` hands each Path its own key.
  const paths = useDerivedValue(() => {
    const shape = skeleton(joints.get(), highlight.get());
    const arc = Skia.PathBuilder.Make();
    if (shape.arc) {
      const { x, y, r, start, sweep } = shape.arc;
      arc.addArc(Skia.XYWHRect(x - r, y - r, r * 2, r * 2), start, sweep);
    }
    return {
      near: segments(shape.near),
      far: segments(shape.far),
      limb: segments(shape.limb),
      arc: arc.detach(),
      dots: circles(shape.dots),
      limbDots: circles(shape.limbDots),
    };
  });

  const idle = tone === 'idle';
  const dot = idle ? colors.subtle : colors.accent;
  const limbDot = tone === 'noRep' ? colors.warn : dot;
  const bone = {
    style: 'stroke',
    strokeCap: 'round',
    strokeJoin: 'round',
    strokeWidth: 3,
  } as const;
  const outline = { style: 'stroke', strokeWidth: 2.5, color: colors.ground } as const;

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
        // that might bind it; reset it (and the camcorder) if that matters.
        onError={(error) => {
          console.error('[camera]', error);
          if (video) onVideoLost();
        }}
      />
      {showSkeleton && (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            path={select(paths, 'far')}
            {...bone}
            color={colors.chalk}
            opacity={idle ? 0.3 : 0.45}
          />
          <Path
            path={select(paths, 'near')}
            {...bone}
            color={colors.chalk}
            opacity={idle ? 0.5 : 1}
          />
          <Path
            path={select(paths, 'limb')}
            {...bone}
            color={tone === 'noRep' ? colors.warn : colors.chalk}
            opacity={idle ? 0.5 : 1}
            strokeWidth={idle ? 3 : 4}
          />
          {tone === 'live' && (
            <Path path={select(paths, 'arc')} {...bone} color={colors.accent} strokeWidth={2.5} />
          )}
          <Path path={select(paths, 'dots')} color={dot} />
          <Path path={select(paths, 'dots')} {...outline} />
          <Path path={select(paths, 'limbDots')} color={limbDot} />
          <Path path={select(paths, 'limbDots')} {...outline} />
        </Canvas>
      )}
    </View>
  );
}
