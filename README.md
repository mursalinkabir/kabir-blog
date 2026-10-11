# smkabir-site

Source for [smkabir.com](https://smkabir.com): a static Astro site (English and Japanese) fed by a headless Payload CMS, served from a homelab with an R2 failover.

- Plan and phases: [docs/PLAN.md](docs/PLAN.md)
- Pinned versions and verification log: [docs/versions.md](docs/versions.md)
- Rules for Claude Code: [CLAUDE.md](CLAUDE.md)
- CMS and how the site reads it: [docs/cms.md](docs/cms.md)
- Deploying: [docs/deploy.md](docs/deploy.md); secrets register: [docs/secrets.md](docs/secrets.md)

## Status

Phase 1 (site), the deploy path (image, release scripts, workflows) and Phases 2 and 3 (Payload locally, the site
built from it) are built and pass their gates. Without a pull, content comes from the sample fixtures in
`apps/site/src/content/fixtures/` and a banner says so. The cluster side and the first release are yours: see
[docs/go-live.md](docs/go-live.md). Details of the CMS: [docs/cms.md](docs/cms.md).

## Develop

Commands below are production-ready (they are what CI will run).

```sh
npx pnpm@12.9.1 install
npx pnpm@12.9.1 dev        # http://localhost:4321
npx pnpm@12.9.1 check      # astro check
npx pnpm@12.9.1 build      # i18n check, build, dist gates, Pagefind index
```

Install [d2](https://d2lang.com) to render diagram blocks locally. In CI a missing `d2` fails the build.
