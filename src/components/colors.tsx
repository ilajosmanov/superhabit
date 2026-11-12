import { useNativeVariable, VariableContextProvider } from 'react-native-css/native';
import type { ReactNode } from 'react';

import { dark, light, type Colors } from '@/theme';

const DARK_VARIABLES = Object.fromEntries(
  Object.entries(dark).map(([name, hex]) => [`--color-${name}`, hex]),
);

/**
 * The palette in force here, for props that take a value. Read off the variable the classes use, so
 * values and classes change in the same frame, and under `Night` it answers dark.
 */
export function useColors(): Colors {
  return useNativeVariable('--color-ground') === light.ground ? light : dark;
}

/**
 * What stays dark in either theme: the camera and video, where light chrome would glare over the picture.
 * Classes and `useColors()` under it give the dark palette.
 */
export function Night({ children }: { children: ReactNode }) {
  return <VariableContextProvider value={DARK_VARIABLES}>{children}</VariableContextProvider>;
}
