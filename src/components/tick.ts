import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** A detent tick, like a picker's. Android's segment tick follows the user's touch-feedback setting. */
export const tick = () =>
  void (Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
    : Haptics.selectionAsync());
