# kabir-blog-cms: the Payload CMS (Next.js standalone server). Build context is the REPO ROOT:
#   docker build -f apps/cms/Dockerfile -t kabir-blog-cms:dev .
#
# Runs as uid 10001 with a read-only root filesystem. It needs writable emptyDirs at:
#   /app/apps/cms/.next/cache   Next's image/data cache
#   /app/apps/cms/media         Payload's local upload dir (unused when R2 storage is configured, but it must exist)
#   /tmp
# Migrations are applied by Payload itself at startup (prodMigrations), so there is no CLI in the image.
#
# Base is Node 24 LTS on Alpine, pinned by digest. Bump it by hand and note it in docs/versions.md.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
# Same pnpm as packageManager in the root package.json.
RUN npm install --global --no-fund --no-audit pnpm@12.9.1

# Dependencies first so this layer is reused while only source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cms/package.json apps/cms/package.json
COPY apps/site/package.json apps/site/package.json
RUN pnpm install --frozen-lockfile --filter @smkabir/cms...

COPY apps/cms apps/cms
# The agent publish gate imports the repo's privacy detectors (core); the type check also reads the CLI scanner.
COPY scripts/privacy-core.mjs scripts/privacy-scan.mjs scripts/
# Build-time placeholders only. They are not stored in the image; the real values arrive at runtime.
RUN cd apps/cms \
 && DATABASE_URL=postgres://build:build@127.0.0.1:1/build PAYLOAD_SECRET=build-only-placeholder \
    NEXT_TELEMETRY_DISABLED=1 pnpm build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=10001:10001 /repo/apps/cms/.next/standalone ./
COPY --from=build --chown=10001:10001 /repo/apps/cms/.next/static ./apps/cms/.next/static
RUN mkdir -p /app/apps/cms/.next/cache /app/apps/cms/media \
 && chown -R 10001:10001 /app/apps/cms/.next/cache /app/apps/cms/media

# Nothing at runtime installs packages, so the package managers in the base image go: npm bundles its own copies of
# brace-expansion, tar, undici and ip-address, which is where the v0.2.0 trivy gate stopped. Also drop the esbuild
# *binary* that file tracing pulled in through the build tooling (a Go program, with Go's standard-library findings);
# Payload does not call it at runtime, which the end-to-end check in docs/versions.md proves.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
          /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && find /app/node_modules -type f -path '*/@esbuild/*/bin/esbuild' -delete

# Numeric: the kubelet cannot prove a *named* user is non-root.
USER 10001:10001
EXPOSE 3100
CMD ["node", "apps/cms/server.js"]
