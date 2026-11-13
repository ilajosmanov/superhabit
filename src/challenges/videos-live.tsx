import { createContext, use, useSyncExternalStore, type ReactNode } from 'react';

import { useLibrary } from './library-live';
import { sharedVideos, subscribeVideos } from '@/storage/set-files';

const Shared = createContext<ReadonlyMap<string, readonly string[]> | null>(null);

/** The video folder, listed once per account and again when a video changes, before any pushed screen needs it. */
export function VideosProvider({ children }: { children: ReactNode }) {
  const { account } = useLibrary();
  const videos = useSyncExternalStore(subscribeVideos, () => sharedVideos(account.id));
  return <Shared value={videos}>{children}</Shared>;
}

/** Synchronous lookup only: the reel selects its own set ids from this shared index. */
export function useVideos() {
  const videos = use(Shared);
  if (!videos) throw new Error('useVideos needs VideosProvider above it');
  return videos;
}
