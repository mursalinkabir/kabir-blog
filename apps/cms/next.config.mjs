import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPayload } from '@payloadcms/next/withPayload';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app serves the public site (src/site, route group (site)) and the admin (route group (payload)).
  poweredByHeader: false,
  reactStrictMode: true,
  // Next 16 otherwise writes an AGENTS.md into the app on first run.
  agentRules: false,
  // A self-contained server for the container image (apps/cms/Dockerfile).
  output: 'standalone',
  // The privacy detectors live in the repo-root scripts/ folder; trace from the workspace root so they are included.
  // Pages are canonical with a trailing slash. The proxy (src/proxy.ts) redirects page paths itself; Next's own rule would also
  // redirect POST /api/mcp, which `trailingSlash: true` must never do.
  skipTrailingSlashRedirect: true,
  // The code highlighter loads language grammars at run time; keep it out of the bundle.
  serverExternalPackages: ['rehype-expressive-code', 'expressive-code', 'shiki'],
  outputFileTracingRoot: path.resolve(here, '../..'),
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
