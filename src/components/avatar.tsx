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
 * A Google photo in a circle (64dp, or 32dp `small` in a list), over the name's initials: offline, or
 * without a photo, the initials show. Decorative: the name sits beside it.
 */
export function Avatar({
  name,
  image,
  small = false,
}: {
  name: string;
  image: string | null;
  small?: boolean;
}) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      className={`${small ? 'size-8' : 'size-16'} items-center justify-center overflow-hidden rounded-full border border-line bg-surface`}
    >
      <Text className={`font-sans font-light text-soft ${small ? 'text-xs' : 'text-2xl'}`}>
        {initials(name)}
      </Text>
      {image && <Image source={{ uri: image }} className="absolute inset-0" resizeMode="cover" />}
    </View>
  );
}
