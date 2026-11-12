import * as SystemUI from 'expo-system-ui';
import { Appearance } from 'react-native';
import { colorScheme } from 'react-native-css/native';

import { keepThemeChoice, themeChoice, type ThemeChoice } from '@/storage/theme-choice';
import { dark, light } from '@/theme';

// The window behind every screen (seen as the keyboard or a rotation moves them) wears the palette too.
const paintWindow = () =>
  void SystemUI.setBackgroundColorAsync(
    (Appearance.getColorScheme() === 'light' ? light : dark).ground,
  );

const wear = (choice: ThemeChoice) => {
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
  // Classes and useColors() now, in one frame: left to Android's own event they trailed the picker.
  colorScheme.set(Appearance.getColorScheme());
  paintWindow();
};

// At load, before anything renders: Android forgets the override when the app's process ends.
wear(themeChoice());
// The phone changing its own theme (sunset) while the choice is "system".
Appearance.addChangeListener(paintWindow);

/** Light, dark or the phone's own: worn now, classes and `useColors()` following, and kept. */
export function chooseTheme(choice: ThemeChoice) {
  keepThemeChoice(choice);
  wear(choice);
}
