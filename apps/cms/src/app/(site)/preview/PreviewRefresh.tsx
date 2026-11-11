'use client';
import { useRouter } from 'next/navigation';
import { RefreshRouteOnSave } from '@payloadcms/live-preview-react';

/** Reloads the preview when the editor saves a draft (Payload's live preview sends a message to this frame). */
export function PreviewRefresh({ serverURL }: { serverURL: string }) {
  const router = useRouter();
  return <RefreshRouteOnSave refresh={() => router.refresh()} serverURL={serverURL} />;
}
