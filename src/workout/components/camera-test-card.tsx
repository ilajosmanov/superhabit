import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, lit } from '@/theme';

// A push-up pose drawn like the live skeleton overlay: grey bones, amber joints. Shoulder, hip,
// knee, ankle, elbow, wrist on a 250×110 grid; the head is the circle.
const JOINTS = [
  [214, 50],
  [150, 70],
  [112, 80],
  [66, 92],
  [220, 72],
  [216, 98],
] as const;
const BONES = 'M214 50L150 70L112 80L66 92M214 50L220 72L216 98';

function PushupPose() {
  return (
    // Positioned by a View: className doesn't reach react-native-svg's Svg.
    <View pointerEvents="none" className="absolute top-3 right-2">
      <Svg width={200} height={88} viewBox="0 0 250 110">
        <Path d="M40 101h200" stroke={colors.line} strokeWidth={1.5} strokeLinecap="round" />
        <Path
          d={BONES}
          stroke={colors.faint}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx={232} cy={36} r={7} stroke={colors.faint} strokeWidth={2} fill="none" />
        {JOINTS.map(([cx, cy]) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={colors.accent} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * The first thing to do with no challenge joined: a push-up test, nothing to commit to.
 * Not a challenge card, so it can lead the screen without looking picked for you.
 */
export function CameraTestCard() {
  const router = useRouter();
  return (
    <View
      // The glow fades out toward the button; the hairline keeps the card's edge where it does.
      className="gap-4 overflow-hidden rounded-3xl border border-line p-5"
      style={{
        backgroundImage: `radial-gradient(120% 90% at 80% 20%, ${colors.surface} 0%, transparent 80%)`,
      }}
    >
      <PushupPose />
      <Text className="font-mono text-xs tracking-widest text-muted">TRY THE CAMERA</Text>
      <View
        accessible
        accessibilityLabel="How many push-ups can you do in one go?"
        className="mt-2 flex-row items-end gap-3"
      >
        <Text className="-ml-1.5 font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk">
          ?
        </Text>
        <Text className="pb-3 font-sans text-2xl font-light leading-tight text-chalk">
          {'push-ups\nin one go'}
        </Text>
      </View>
      <View className="overflow-hidden rounded-full">
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens the camera for a push-up test. Nothing to join."
          // Ground at 16%, the same shade the hold-to-start fill uses.
          android_ripple={{ color: `${colors.ground}29`, foreground: true }}
          onPress={() => router.push({ pathname: '/workout/[id]', params: { id: 'pushup' } })}
          className="h-14 items-center justify-center bg-accent"
          style={lit}
        >
          <Text className="font-sans text-lg font-semibold tracking-tight text-ground">
            Find out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
