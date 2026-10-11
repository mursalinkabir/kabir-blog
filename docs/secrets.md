# Secrets register

Names, scopes and rotation only. **No values, ever.** Anything not listed here must not exist.
Where a value lives decides who can read it; the site repo never holds cluster or GitOps credentials.

## GitHub (repository kabir-blog)

Stored in the `site-publish` **environment** unless noted, so only the publish jobs can read them.

| Name                              | Kind                                       | Scope                                                                                                          | Used by                           | Rotate                |
| --------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------- |
| `R2_ACCOUNT_ID`                   | secret (not sensitive, kept with the rest) | the Cloudflare account                                                                                         | content.yml, content-rollback.yml | never                 |
| `R2_SITE_WRITE_ACCESS_KEY_ID`     | secret                                     | R2 **object read and write**, bucket `kabir-blog-site` only                                                    | upload, pointers, prune           | yearly                |
| `R2_SITE_WRITE_SECRET_ACCESS_KEY` | secret                                     | same token                                                                                                     | same                              | yearly                |
| `CF_API_TOKEN`                    | secret                                     | **Cache Purge** on the `smkabir.com` zone only (Workers deploy is added with Phase 8)                          | purge after publish and rollback  | yearly                |
| `CF_ZONE_ID`                      | secret                                     | the `smkabir.com` zone id                                                                                      | purge                             | never                 |
| `PRIVACY_DENYLIST`                | secret (repository level)                  | comma-separated private terms (address fragments, employer, phone)                                             | privacy scan                      | when the list changes |
| `R2_SITE_BUCKET`                  | variable                                   | bucket name, default `kabir-blog-site`                                                                         | publish                           | n/a                   |
| `SITE_URL`                        | variable                                   | where CI watches `version.json`; defaults to `https://smkabir.com`, set only for a dry run on another hostname | publish, rollback                 | n/a                   |

Added by later phases (not used yet): `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` (CI service token for the
CMS, Phase 3), `PAYLOAD_BUILDER_KEY` (read-only, Phase 3), the dispatch PAT (Phase 7).

`GITHUB_TOKEN` (automatic) pushes the image to GHCR (`packages: write` in release.yml only).

## Cluster (homelab-terraform, SealedSecrets only)

| Name      | Namespace | Contents                                                               | Scope                                             | Rotate |
| --------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| `blog-r2` | `blog`    | `RCLONE_CONFIG_R2_ACCESS_KEY_ID`, `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` | R2 **object read only**, bucket `kabir-blog-site` | yearly |

The two R2 tokens are different on purpose: CI can write releases, the pods can only read them, so a compromised
pod cannot alter what the site serves or what the failover mirror will serve.

## Local development only

`apps/cms/.env` (git-ignored) holds `PAYLOAD_SECRET` and the throwaway local database URL; `apps/cms/.dev-credentials`
(git-ignored, mode 0600, written by `pnpm cms:seed`) holds a generated local admin password and a local read-only
builder key. None of these exist in the cluster or in GitHub. Production users and keys are created in the admin,
and the production `PAYLOAD_SECRET` is a SealedSecret (Phase 4).

## Never

- a plain `Secret` in Git, a token in a workflow file, an `.env` with values committed;
- a cluster credential or a `homelab-terraform` write key in GitHub (a compromised pipeline could then push any
  manifest into the cluster, which is exactly what this design avoids).
