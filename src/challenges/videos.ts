import { videoIndex } from '@/storage/set-files';

type VideoSnapshot = {
  accountId: string;
  revision: number;
  videos: ReadonlyMap<string, readonly string[]>;
};

/** One account's folder index per availability revision, shared by every mounted consumer. */
export function videoSnapshot(
  accountId: string,
  revision: number,
  previous: VideoSnapshot | null,
): VideoSnapshot {
  if (previous && previous.accountId === accountId && previous.revision === revision)
    return previous;
  return { accountId, revision, videos: videoIndex() };
}
