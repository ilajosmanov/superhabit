import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Android's own feedback `kind`, which follows the user's touch-feedback setting; a selection tick on iOS.
 * By default a detent tick, like a picker's.
 */
export const tick = (kind = Haptics.AndroidHaptics.Segment_Tick) =>
  void (Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(kind)
    : Haptics.selectionAsync());
