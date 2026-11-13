import { createContext, use, useState, useSyncExternalStore, type ReactNode } from 'react';

import { useLibrary } from './library-live';
import { videoSnapshot } from './videos';
import { subscribeVideos, videoRevision } from '@/storage/set-files';

const Shared = createContext<ReadonlyMap<string, readonly string[]> | null>(null);

/** Read the video folder once per account/revision, before any pushed screen needs its files. */
export function VideosProvider({ children }: { children: ReactNode }) {
  const { account } = useLibrary();
  const revision = useSyncExternalStore(subscribeVideos, videoRevision);
  const [snapshot, setSnapshot] = useState(() => videoSnapshot(account.id, revision, null));
  const current = videoSnapshot(account.id, revision, snapshot);
  if (current !== snapshot) setSnapshot(current);
  return <Shared value={current.videos}>{children}</Shared>;
}

/** Synchronous lookup only: the reel selects its own set ids from this shared index. */
export function useVideos() {
  const videos = use(Shared);
  if (!videos) throw new Error('useVideos needs VideosProvider above it');
  return videos;
}
