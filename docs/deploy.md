# Deploying smkabir.com

Status: **the deploy path is built and tested locally; nothing is deployed.**
**To put smkabir.com live, follow the click-by-click guide: [docs/go-live.md](go-live.md).** This page is the
reference behind it: how the pieces fit, what was tested, and how operations work afterwards. It implements docs/PLAN.md Phase 5 (first deploy on `next.smkabir.com`) and
Phase 6 (apex cutover). Everything marked **(you)** needs a login this repo does not and must not have.

## How a release works

```
 git push (main)  ->  content.yml  builds dist/  ->  R2  releases/<build_id>/   then pointer LATEST
                                                          |
   pods: content-sync polls LATEST every 60 s  <----------+      CI polls /version.json until it matches,
         downloads, checks, swaps `current`                      then writes VERIFIED and purges the cache
```

| What changes                                   | How it ships                                                                                     | Touches the cluster repo?                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| A post, a page, the site's templates or styles | push to `main` (or a CMS publish later). `content.yml` publishes a release; pods follow `LATEST` | **No**                                                      |
| The nginx config, headers, or the sidecar      | tag `vX.Y.Z`; `release.yml` pushes `ghcr.io/mursalinkabir/kabir-blog-server:X.Y.Z`               | **Yes**: a hand-made tag bump in `prod/apps/blog/blog.yaml` |
| Roll back content                              | run the **content-rollback** workflow with an earlier build id                                   | No                                                          |
| Roll back code                                 | `git revert` the bump commit in homelab-terraform                                                | Yes                                                         |

The site repo never holds a cluster credential or write access to homelab-terraform.

## What exists in this repo

| Piece                                      | Where                                                      | Verified how                                                                               |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Server image (nginx 1.30 stable + sidecar) | `apps/server/`                                             | `bash apps/server/tests/run.sh`: 49 checks on arm64 and amd64                              |
| Sidecar                                    | `apps/server/content-sync/content-sync.sh`                 | same suite: traversal, bad version, missing index, swap, prune, redirect injection, reload |
| Release publisher                          | `scripts/ci/release.sh`                                    | `scripts/ci/test-release.sh`: 24 checks against a fake bucket                              |
| Pinned tool installer (d2, rclone)         | `scripts/ci/install-tools.sh`                              | run on clean Ubuntu amd64; hashes verified                                                 |
| Workflows                                  | `.github/workflows/{content,content-rollback,release}.yml` | actionlint clean; action SHAs resolved from tags                                           |
| Manifests (draft)                          | `deploy/homelab-terraform/prod/apps/blog/`                 | kubeconform 5/5 valid; PodSecurity `restricted` rules checked                              |
| NetworkPolicy (draft, not for auto-apply)  | `deploy/homelab-terraform/docs/`                           | **untested**, see the file                                                                 |
| Whole chain with the real site             | `apps/server/tests/e2e.sh`                                 | 45 sitemap URLs, all 200 through nginx; real browser: search (WASM) and CSP clean          |

Not built yet: the CMS and preview images (Phases 2 to 4), the Workers (contact, failover; Phases 8 and 9), the
CMS fetch in `content.yml` (Phase 3). Until then `content.yml` builds from the fixtures in the repo.

## First deploy, in order (summary; the detailed version is go-live.md)

Each step lists what to expect. Stop at the first thing that differs.

### 1. Accounts and buckets **(you)**

1. The repo is `mursalinkabir/kabir-blog` (public, `origin` is set, `main` is pushed). Artifacts are named after it:
   R2 bucket `kabir-blog-site`, GHCR image `kabir-blog-server`.
2. Cloudflare: R2 bucket `kabir-blog-site`. Two API tokens, both limited to that bucket: **Object Read & Write**
   (for CI) and **Object Read only** (for the pods). Note the account id.
3. GitHub > Settings > Environments > create `site-publish`; add the secrets from `docs/secrets.md` there.
   `SITE_URL` defaults to `https://smkabir.com`; set it only for a dry run on another hostname.
4. Renovate (optional): install the app; `renovate.json` pins Action digests and updates the base image.

### 2. First code release

1. Write the CHANGELOG entry: rename `## Unreleased` to `## 0.1.2 - <date>` (0.1.0 and 0.1.1 were tagged but stopped before an image existed: see CHANGELOG).
2. `git tag v0.1.2 && git push origin v0.1.2`.
3. `release.yml` runs the image tests, scans with trivy (fixable HIGH/CRITICAL fail), and pushes
   `ghcr.io/mursalinkabir/kabir-blog-server:0.1.2`. Make the package **public** (it contains no content).

### 3. First content release

`content.yml` runs on the push in step 1. It will build, upload, set `LATEST`, then **wait** for the site's
`/version.json` (up to 10 minutes). That wait fails until steps 4 and 5 are done. That is expected: use
**Re-run failed jobs** afterwards. The upload step is safe to repeat (identical content is a no-op; different
content under the same id is refused).

### 4. Cluster **(you)**

1. Copy `deploy/homelab-terraform/prod/apps/blog/blog.yaml` to `homelab-terraform/prod/apps/blog/`.
2. Fill `<ACCOUNT_ID>`; create `r2-site.sealed.yaml` (README in that folder). Confirm the tag is `0.1.2`.
3. Commit and push. Argo CD creates namespace `blog` within about 3 minutes.
4. ```sh
   kubectl -n blog get pods -o wide        # 2 pods, Ready 2/2 after the sidecar has fetched a release
   kubectl -n blog logs deploy/blog -c content-sync | tail    # "now serving <build_id>"
   ```

### 5. Tunnel route **(you)**

Cloudflare > `k8s-homelab` > Published application routes: `smkabir.com` (empty subdomain), as in the manifest folder's README.

### Phase 5 gate (from the plan)

| Check                                 | Command or action                                        | Expect                                                                                |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `version.json` matches LATEST         | `curl -s https://smkabir.com/version.json`               | the `build_id` CI printed                                                             |
| Pods on different PVE hosts           | `kubectl -n blog get pods -o wide`                       | two nodes (only once the Talos drift is fixed)                                        |
| A new publish needs no cluster commit | push a change to the site                                | pods serve it within about 2 minutes, `git log` of homelab-terraform unchanged        |
| Deleting a pod drops no requests      | `kubectl -n blog delete pod <one>` during a request loop | zero failures (PDB and 2 replicas)                                                    |
| PodSecurity `restricted` admitted     | `kubectl -n blog get events`                             | no `FailedCreate` for PodSecurity                                                     |
| Headers                               | `curl -sI https://smkabir.com/`                          | CSP, nosniff, Referrer-Policy, Permissions-Policy, `Cache-Control: ...s-maxage=86400` |

## Moving from a dry-run hostname to the apex (only if you did a dry run)

1. Cloudflare: published route for `smkabir.com` (same service, Origin Server Name `smkabir.com`); verify the
   flattened CNAME was created. Add the `www` to apex 301 as a Redirect Rule.
2. homelab-terraform: HTTPRoute `hostnames: [smkabir.com]`, `sectionName: https-apex`. Commit.
3. GitHub variable `SITE_URL=https://smkabir.com`.
4. Gate: the apex serves with the existing wildcard certificate; `www` 301s to the apex; SSL mode is Full (strict).

## Rolling back

| Symptom                        | Fix                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| A bad post or template is live | Actions > **content-rollback** > `build_id` of the last good release. Pods follow within a minute; CI purges the cache. |
| A bad image                    | `git revert` the tag-bump commit in homelab-terraform. Argo CD rolls back.                                              |
| Both                           | Roll content back first (instant), then revert the image.                                                               |

Releases are kept: the last 20 in R2 (never one that `LATEST` or `VERIFIED` points at), and the pods keep the
live release plus the previous one on disk.

## Failure behaviour (what the design promises)

| Failure                               | Result                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R2 unreachable                        | running pods keep serving what they have; a rescheduled pod stays unready until it can fetch                                               |
| A release is corrupt or half uploaded | `LATEST` is only moved after upload and verification; the sidecar re-checks `version.json` and `index.html`; the old release keeps serving |
| Homelab down                          | the site is down until the failover Worker exists (Phase 9). Publishing also stops                                                         |
| CI cannot reach the site              | the job fails loudly and `VERIFIED` does not move; the live site is unaffected                                                             |

## What has been proven, and what has not (updated 2026-10-12)

The first real deploy happened on 2026-10-12. What used to be "cannot be proven locally" is now measured:

| Item                                                    | Status                                                                                                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 (rclone with `provider = Cloudflare`, scoped tokens) | Proven in production: upload, pointer moves, prune; pods read with a read-only token. A wrong secret gives `403 SignatureDoesNotMatch`.                                                   |
| GitHub Actions (`content`, `release`)                   | Proven. Found and fixed: a test variable collided with the workflow's `IMAGE`; the vulnerability scan stopped a release (`tiff`); Cloudflare's bot challenge blocked the live-site check. |
| Cilium Gateway, Argo CD, the tunnel, the apex           | Proven: Synced/Healthy in about two minutes, TLS verifies, HTTPRoute attached to `https-apex`.                                                                                            |
| Trivy                                                   | Passed after the unused nginx modules were removed. The result depends on the day's database.                                                                                             |
| **The failover Worker**                                 | **Not built.** A homelab-wide outage still takes the site down. See the post "How smkabir.com stays up".                                                                                  |
| A real power cut or a sustained R2 outage               | Not exercised.                                                                                                                                                                            |
| NetworkPolicy                                           | Still a draft with two open questions (file header).                                                                                                                                      |

## The CMS service (Phase 4)

The CMS is a second image, `ghcr.io/mursalinkabir/kabir-blog-cms:<version>`, built by the `cms-image` job of
`release.yml` on the same `vX.Y.Z` tag as the server image (`apps/cms/Dockerfile`, build context = repo root). It is
deployed the same way: a hand-made tag bump in homelab-terraform (`prod/apps/cms/cms.yaml`), rolled back with
`git revert`. The job smoke-tests the image under the cluster's restrictions (uid 10001, read-only root filesystem, all
capabilities dropped) and fails the release on a fixable HIGH or CRITICAL finding.

**Access is verified in the application, not only at the edge.** `apps/cms/src/proxy.ts` checks the
`Cf-Access-Jwt-Assertion` header on every request in production (RS256 signature against the team's keys, issuer,
audience, expiry), so a mistaken tunnel route or a port-forward still cannot reach the admin or `/api/mcp`.

| Path          | Behaviour                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `/healthz`    | `200` from the proxy itself; liveness. No Access needed (the kubelet cannot present one).               |
| `/readyz`     | `200` only when Payload started, migrations ran and the database answered; readiness. No Access needed. |
| anything else | valid assertion → served; none → `401`; invalid → `403`; Access not configured → `503` (fails closed).  |

Outside production the gate is open, so `pnpm cms:dev` and the local agent checks are unchanged.

**Migrations run at startup.** The image has no `payload` CLI. In production the Postgres adapter applies the
committed migrations (`prodMigrations`) when it connects, which the first `/readyz` probe triggers, so a new pod
migrates before it takes traffic. The Deployment is one replica with `strategy: Recreate`, so there is never a second
migrator. A schema change therefore ships as: migration committed → tag → image → tag bump.

Runtime configuration (production-ready; names only, values live in SealedSecrets or the ConfigMap):

| Variable                                       | Where        | Meaning                                                                |
| ---------------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `DATABASE_URL`                                 | SealedSecret | `pg-main-rw` directly (the pooler is transaction-mode), role `payload` |
| `PAYLOAD_SECRET`                               | SealedSecret | signs sessions and API keys                                            |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`     | SealedSecret | R2 token for the media bucket only                                     |
| `GITHUB_DISPATCH_TOKEN`                        | SealedSecret | fine-grained, this repo, Contents write; rebuilds the site on publish  |
| `S3_BUCKET`, `S3_ENDPOINT`, `MEDIA_PUBLIC_URL` | ConfigMap    | media bucket, R2 endpoint, `https://media.smkabir.com`                 |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`       | ConfigMap    | the Access application; **empty = the CMS refuses everything**         |
| `CMS_PUBLIC_URL`, `AGENT_AUTO_PUBLISH`         | ConfigMap    | `https://cms.smkabir.com`; `0` until you decide agents may publish     |

**Proven in the cluster (2026-10-12, `kabir-blog-cms:0.2.1`):** the pod became Ready 22 s after Argo created it, the
four migrations applied to database `payload` on `pg-main`, and the `payload` `Database` resource reports applied.
Not yet proven: the Access gate through the Gateway (no tunnel route exists), media in R2, publish dispatch, and a
backup restore (no backups exist yet; `deploy/homelab-terraform/prod/data-platform/backup/`).

### Your steps for the CMS (Cloudflare dashboard, then two scripts)

1. **R2 → Create bucket** `kabir-blog-media` (public access: attach the custom domain `media.smkabir.com`).
2. **R2 → Create bucket** `kabir-blog-pg-backups` (no public access, no custom domain).
3. **R2 → Manage R2 API tokens → Create API token**, twice, each **Object Read & Write**, each scoped to **one** bucket
   (`kabir-blog-media`, then `kabir-blog-pg-backups`). Copy each Access Key ID and Secret Access Key when shown.
4. Run `bash deploy/homelab-terraform/seal-cms-extras.sh` (media token, optional GitHub dispatch token) and
   `bash deploy/homelab-terraform/prod/data-platform/backup/seal-pg-backups.sh` (backups token). Both prompt with
   hidden input and write sealed files only.
5. **Zero Trust → Access → Applications → Add → Self-hosted**, domain `cms.smkabir.com`; policy Allow = your email,
   plus a Service Auth policy for the service token the CI and the agent bridge use. Copy the team domain and the
   application's AUD tag into `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in `cms.yaml`.
6. Only then: **Networks → Tunnels → `k8s-homelab` → Published application routes** for `cms.smkabir.com`
   (service `https://cilium-gateway-public.gateway.svc.cluster.local:443`, origin server name `cms.smkabir.com`).

Order that keeps the admin from ever being public: DB role and CMS Deployment (no route) → Access application
"cms" → set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` → tunnel route for `cms.smkabir.com` → verify with and
without Access (`docs/PLAN.md`, Phase 4 gate).

## Troubleshooting

| You see                                                | Look at                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Pods `Running` but `0/1 Ready` forever                 | `kubectl -n blog logs deploy/blog -c content-sync`: bad R2 token or endpoint, or LATEST empty                 |
| `rejected release ...: version.json says ...`          | the upload was not for that id; re-run content.yml                                                            |
| content.yml fails at "Wait until the origin serves it" | route or DNS not ready yet, or pods cannot read R2; releases are not deleted, just re-run                     |
| Redirects not applied                                  | sidecar log "could not signal nginx": `shareProcessNamespace` or the shared `/tmp` is missing in the manifest |
| `ImagePullBackOff`                                     | the GHCR package is still private, or the tag does not exist                                                  |
