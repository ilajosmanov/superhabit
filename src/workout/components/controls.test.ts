import { isValidElement } from 'react';
import { expect, it, vi } from 'vite-plus/test';

vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('react-native-safe-area-context', () => ({}));
vi.mock('@expo/ui/jetpack-compose', () => ({}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({}));
vi.mock('expo-symbols', () => ({}));
vi.mock('react-native-css/native', () => ({}));
vi.mock('expo-symbols/androidWeights/light', () => ({ default: 300 }));

const { Caption } = await import('./controls');

it('lets TalkBack announce captions only when the voice coach is muted', () => {
  const spoken = Caption({ text: 'Go', muted: false });
  const silent = Caption({ text: 'Go', muted: true });
  if (
    !isValidElement<{ accessibilityLiveRegion: string }>(spoken) ||
    !isValidElement<{ accessibilityLiveRegion: string }>(silent)
  )
    throw new Error('Missing caption');
  expect(spoken.props.accessibilityLiveRegion).toBe('none');
  expect(silent.props.accessibilityLiveRegion).toBe('polite');
});
