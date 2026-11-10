import { Image, Text, View } from 'react-native';

/** "AL" for Ann Lee: the first letters of the first two words. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

/**
 * Your photo from Google in a 64dp circle, over your initials: offline, or without a photo, the initials
 * show. Decorative: your name sits beside it.
 */
export function Avatar({ name, image }: { name: string; image: string | null }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      className="h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-line bg-surface"
    >
      <Text className="font-sans text-2xl font-light text-soft">{initials(name)}</Text>
      {image && <Image source={{ uri: image }} className="absolute inset-0" resizeMode="cover" />}
    </View>
  );
}
