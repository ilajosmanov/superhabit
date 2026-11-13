import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import light from 'expo-symbols/androidWeights/light';

import { useColors } from './colors';

/**
 * The SF Symbol drawn on iOS for each Material Symbol the app uses. A name missing here shows a plain circle
 * on iOS, so add its pair when a new icon comes in.
 */
const SF: Partial<Record<AndroidSymbol, SFSymbol>> = {
  ac_unit: 'snowflake',
  accessibility_new: 'figure.arms.open',
  add: 'plus',
  archive: 'archivebox',
  arrow_downward: 'arrow.down',
  arrow_forward: 'arrow.right',
  arrow_upward: 'arrow.up',
  build: 'wrench.and.screwdriver',
  cameraswitch: 'arrow.triangle.2.circlepath.camera',
  chat_bubble: 'bubble.left',
  check: 'checkmark',
  close: 'xmark',
  cloud_off: 'icloud.slash',
  create: 'pencil',
  delete: 'trash',
  edit: 'pencil',
  error: 'exclamationmark.circle',
  flag: 'flag',
  help: 'questionmark.circle',
  home: 'house',
  info: 'info.circle',
  leaderboard: 'chart.bar',
  login: 'rectangle.portrait.and.arrow.right',
  logout: 'rectangle.portrait.and.arrow.right',
  open_in_full: 'arrow.up.left.and.arrow.down.right',
  pause: 'pause',
  person: 'person',
  play_arrow: 'play',
  policy: 'checkmark.shield',
  refresh: 'arrow.clockwise',
  remove: 'minus',
  scatter_plot: 'circle.grid.cross',
  schedule: 'clock',
  share: 'square.and.arrow.up',
  smartphone: 'iphone',
  toggle_off: 'switch.2',
  tune: 'slider.horizontal.3',
  videocam_off: 'video.slash',
  visibility_off: 'eye.slash',
  volume_off: 'speaker.slash',
  volume_up: 'speaker.wave.2',
};

/** The SF Symbol iOS draws for a Material Symbol (a plain circle for one not paired yet). */
export const sfSymbol = (name: AndroidSymbol): SFSymbol => SF[name] ?? 'circle';

/**
 * A Material Symbol (its SF Symbol pair on iOS), light like the design's 1.5px line, chalk unless told.
 * Decorative: whatever holds it (a button, a labelled row) says what it means, so TalkBack and VoiceOver skip it.
 */
export function Icon({
  name,
  size = 24,
  color: given,
}: {
  name: AndroidSymbol;
  size?: number;
  color?: string;
}) {
  const colors = useColors();
  const color = given ?? colors.chalk;
  return (
    <SymbolView
      name={{ android: name, ios: sfSymbol(name) }}
      weight={{ ios: 'light', android: light }}
      size={size}
      tintColor={color}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  );
}
