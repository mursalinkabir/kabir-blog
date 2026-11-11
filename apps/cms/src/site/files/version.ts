import { ASSET_VERSION } from '../assets';
import type { SnapshotStore } from '../data/store';

/** What the release check and an operator read: which code, which content, when it was loaded and how many documents were skipped. */
export function versionJson(status: ReturnType<SnapshotStore['status']>, env: Record<string, string | undefined> = process.env): string {
  return (
    JSON.stringify({
      build_id: env.BUILD_ID ?? ASSET_VERSION,
      content_version: status.version,
      loaded_at: status.loadedAt,
      stale: status.stale,
      skipped_documents: status.errors,
    }) + '\n'
  );
}
