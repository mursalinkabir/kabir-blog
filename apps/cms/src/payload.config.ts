import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { s3Storage } from '@payloadcms/storage-s3';
import { mcpPlugin } from '@payloadcms/plugin-mcp';

import { Users } from './collections/Users';
import { Media } from './collections/Media';
import { Categories } from './collections/Categories';
import { Tags } from './collections/Tags';
import { Posts } from './collections/Posts';
import { Projects } from './collections/Projects';
import { Pages } from './collections/Pages';
import { AgentLog } from './collections/AgentLog';
import { agentTools } from './mcp/tools';
import { migrations } from './migrations';
import { NowGlobal, ResumeGlobal, SiteGlobal, UsesGlobal } from './globals';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const useR2 = Boolean(process.env.S3_BUCKET);

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · smkabir.com CMS' },
  },
  collections: [Users, Media, Categories, Tags, Posts, Projects, Pages, AgentLog],
  globals: [SiteGlobal, NowGlobal, UsesGlobal, ResumeGlobal],
  editor: lexicalEditor(),

  // English is the default; Japanese is its own set of fields. `fallback: false` is deliberate: a missing Japanese
  // field must produce no Japanese page, not an English page under a Japanese URL (docs/PLAN.md, "i18n rules").
  localization: {
    locales: [
      { code: 'en', label: 'English' },
      { code: 'ja', label: '日本語' },
    ],
    defaultLocale: 'en',
    fallback: false,
  },

  // The site and the admin use REST only. No GraphQL means no extra query surface to defend.
  graphQL: { disable: true },

  secret: process.env.PAYLOAD_SECRET || '',

  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    // Migrations are committed and applied explicitly (`pnpm migrate`). Schema "push" is never used, so what runs
    // in production is exactly what was reviewed.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    // The container has no `payload` CLI. In production the adapter applies the committed migrations itself when it
    // connects (one replica, Recreate strategy, so there is never a second migrator).
    prodMigrations: migrations,
  }),

  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  sharp,

  // Phase 4: media goes to R2 and is served from media.smkabir.com, never through the tunnel. Unset locally.
  plugins: [
    // The MCP endpoint (/api/mcp) an AI agent writes and publishes through. Only the custom tools in src/mcp are
    // exposed: no generic collection tools are enabled, so there is no way to reach data the tools do not offer.
    // Keys are created per agent user with `pnpm cms:agent-key`; each key can switch single tools off in the admin.
    mcpPlugin({ collections: {}, userCollection: 'users', mcp: { tools: agentTools } }),
    ...(useR2
      ? [
          s3Storage({
            collections: {
              media: {
                generateFileURL: ({ filename, prefix }) => `${process.env.MEDIA_PUBLIC_URL}/${prefix ? `${prefix}/` : ''}${filename}`,
              },
            },
            bucket: process.env.S3_BUCKET as string,
            config: {
              region: 'auto',
              endpoint: process.env.S3_ENDPOINT,
              credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
              },
              forcePathStyle: true,
            },
          }),
        ]
      : []),
  ],
});
