import { withPayload } from '@payloadcms/next/withPayload';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The admin is internal (behind Cloudflare Access); no public pages are served from this app.
  poweredByHeader: false,
  reactStrictMode: true,
  // Next 16 otherwise writes an AGENTS.md into the app on first run.
  agentRules: false,
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
