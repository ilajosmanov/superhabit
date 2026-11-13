import { requireNativeModule } from 'expo';

/** Each corner's radius in dp, for the window's current rotation. */
export type Corners = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

const native = requireNativeModule<{ corners(): Promise<Corners | null> }>('DisplayCorners');

/**
 * The display's corner radii, read on the main thread; null where the system doesn't report them
 * (Android < 12, iOS < 26) or the read fails, since a caller only draws with them.
 */
export const displayCorners = () => native.corners().catch(() => null);
