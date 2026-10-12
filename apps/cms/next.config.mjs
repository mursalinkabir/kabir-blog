import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPayload } from '@payloadcms/next/withPayload';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The admin is internal (behind Cloudflare Access); no public pages are served from this app.
  poweredByHeader: false,
  reactStrictMode: true,
  // Next 16 otherwise writes an AGENTS.md into the app on first run.
  agentRules: false,
  // A self-contained server for the container image (apps/cms/Dockerfile).
  output: 'standalone',
  // The privacy detectors live in the repo-root scripts/ folder; trace from the workspace root so they are included.
  outputFileTracingRoot: path.resolve(here, '../..'),
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
