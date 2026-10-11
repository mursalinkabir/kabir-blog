# Go live: smkabir.com serves this blog

Follow top to bottom. Every step says **where**, **what to do**, and **what you should see**. Stop at the first
thing that differs and check the table at the end. Background and design: `docs/deploy.md`.

Time: about 60 to 90 minutes, mostly clicking in Cloudflare and GitHub.

## What is true today (checked 2026-10-11)

| Fact                                                                                                                      | How it was checked        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `smkabir.com` has no DNS records and no route; nothing answers there                                                      | `dig` on 1.1.1.1          |
| DNS is on Cloudflare (`kurt.ns.cloudflare.com`, `maisie.ns.cloudflare.com`)                                               | `dig NS`                  |
| The cluster's Gateway `public` already has the apex listener `https-apex` for `smkabir.com`, Programmed, on 192.168.1.200 | `kubectl get gateway`     |
| The certificate `smkabir-wildcard-tls` is Ready and covers the apex                                                       | `kubectl get certificate` |
| `hello.smkabir.com` already works through the same tunnel                                                                 | `curl` returned 200       |
| `sealed-secrets-controller` runs in `kube-system`; `kubeseal` is installed here                                           | `kubectl`, `which`        |
| No `blog` namespace exists yet                                                                                            | `kubectl get ns`          |

Because nothing is at the apex today, going live cannot break an existing site.

## Read this before you flip it on

1. **The content is sample content.** The site shows a "Sample content from fixtures" banner, a placeholder
   resume, and sample posts. Going live puts that on smkabir.com. If you do not want that yet, do Parts 1 to 7
   with the **dry-run** option in Part 6, and move to the apex when the real content exists.
2. **`hello@smkabir.com` does not receive mail yet** (the zone has no MX; Email Routing comes from your probe plan).
   It is printed in the footer icon and on the resume. The contact form is disabled until the contact Worker exists.
3. **No failover yet.** If the homelab is down the site is down (the R2 failover Worker is Phase 9).

---

## Part 1. Put the code on GitHub (10 min)

**Done (2026-10-12):** the repo is `mursalinkabir/kabir-blog` and it is **public**. The repo name differs from the
`smkabir-site` used in docs/PLAN.md; wherever this guide says "the repo", it means `kabir-blog`. The artifacts are
named after it: R2 bucket `kabir-blog-site`, image `kabir-blog-server`. (Neither existed yet when they were renamed.)

What a public repo means here: everything committed is world-readable, so secrets live only in GitHub environment
secrets, the commit author email must be the GitHub no-reply address, and the review below applies to every commit.

**1.1 Before each push.**

```sh
npx pnpm@12.9.1 privacy          # expect: privacy-scan: clean
git status --short | head -60    # skim it: no .env, no .dev-credentials, no node_modules, no dist
git config user.email            # expect the ...@users.noreply.github.com address
```

**You should see (first push):** an Actions run named **content**. `build` goes green; `publish` **fails at "Upload
the release"** because the secrets do not exist yet. That is expected and harmless: no pointer moves. It was
confirmed on the first real run (2026-10-12).

**1.2 Public-repository settings (5 min, once).** Repo > **Settings**:

- **Code security**: enable _Secret scanning_ and _Push protection_; enable _Private vulnerability reporting_.
- **Actions > General**: _Fork pull request workflows_ > require approval for all outside collaborators. (The workflows
  have no `pull_request` trigger, so a fork cannot run them with your secrets; this is a second lock.)
- **Environments > site-publish**: _Deployment branches and tags_ > **Selected branches** > `main`.
- **Licence**: add a `LICENSE` file (MIT is the usual choice for the code). The sample posts and the Unsplash photos
  are credited in `apps/site/public/images/covers/CREDITS.md`.

---

## Part 2. Cloudflare R2 (10 min)

Your account already uses R2 (the Terraform state), so it is enabled.

**2.1 Create the bucket.** Cloudflare dashboard > **R2 Object Storage** > **Create bucket**: name **`kabir-blog-site`**,
location Automatic. Leave **public access off**.

**2.2 Note your account id.** R2 overview page, right side: **Account ID**. Copy it (not secret).

**2.3 CI token (read and write).** R2 > **Manage API tokens** > **Create API token**:

- Name `kabir-blog-ci-write`
- Permission **Object Read & Write**
- Specify bucket: **kabir-blog-site** only
- Create, then copy the **Access Key ID** and **Secret Access Key** now (the secret is shown once).

**2.4 Pod token (read only).** Create a second token: name `kabir-blog-pods-read`, permission **Object Read
only**, bucket **kabir-blog-site** only. Copy both values; you need them in Part 6.

**2.5 Cache-purge token.** Top right profile > **My Profile** > **API Tokens** > **Create Token** > Custom token:

- Permissions: **Zone** / **Cache Purge** / **Purge**
- Zone resources: **Include** > **Specific zone** > `smkabir.com`
- Create and copy the token.

**2.6 Zone id.** Dashboard > `smkabir.com` > **Overview**, right sidebar: **Zone ID**. Copy it.

---

## Part 3. GitHub settings (5 min)

**3.1 Create the environment.** Repo `kabir-blog` > **Settings** > **Environments** > **New environment** >
name **`site-publish`**. No reviewers needed.

**3.2 Add five secrets to that environment** (Environment secrets > Add secret). Names exactly:

| Name                              | Value           |
| --------------------------------- | --------------- |
| `R2_ACCOUNT_ID`                   | the id from 2.2 |
| `R2_SITE_WRITE_ACCESS_KEY_ID`     | from 2.3        |
| `R2_SITE_WRITE_SECRET_ACCESS_KEY` | from 2.3        |
| `CF_API_TOKEN`                    | from 2.5        |
| `CF_ZONE_ID`                      | from 2.6        |

**3.3 Optional.** Settings > Secrets and variables > Actions > **Repository secret** `PRIVACY_DENYLIST`: a
comma-separated list of private words that must never appear (a street name, an employer). Skip it if unsure; the
scan still checks image GPS and personal-data patterns.

No variables are needed: the workflows default to `https://smkabir.com`.

---

## Part 4. Release the server image (15 min, mostly waiting)

**4.1 Write the changelog entry.** In `CHANGELOG.md`, directly under the line `## Unreleased`, add a blank line
and a new heading `## 0.1.0 - 2026-10-11`, so the existing sections belong to 0.1.0. (The release refuses to run
without this heading.)

**4.2 Commit, tag, push.**

```sh
git commit -am "Release 0.1.0"
git tag v0.1.0
git push origin main v0.1.0
```

**4.3 Watch it.** GitHub > **Actions** > **release**. Two jobs: **verify** (runs the image tests, about 5 minutes)
then **image** (build, trivy scan, push).

**You should see:** both green, and in the run summary `ghcr.io/mursalinkabir/kabir-blog-server:0.1.0`.
If trivy fails on a fixable HIGH or CRITICAL finding, that is the scan doing its job: the base image needs a bump
(`apps/server/Dockerfile`); tell me the finding and I will fix it. Tags are never moved, so the fix ships as `v0.1.1`.

**4.4 Make the package public.** GitHub > your profile > **Packages** > `kabir-blog-server` > **Package
settings** (right) > **Danger Zone** > **Change visibility** > **Public**. (It holds no content or secrets; public
lets the cluster pull it without a pull secret.)

**4.5 Check.** `docker logout ghcr.io; docker pull ghcr.io/mursalinkabir/kabir-blog-server:0.1.0` works.

---

## Part 5. First content release (5 min)

**5.1** GitHub > **Actions** > the failed **content** run from Part 1 > **Re-run all jobs**.
(Or push any small change to `main`.)

**You should see:** `build` green, then `publish` goes green through "Upload the release" and "Point LATEST", and
then **fails at "Wait until the origin serves it"** after 10 minutes. **That red X is expected** here: the site is
not routed yet. The release and the `LATEST` pointer are already in R2, which is all the pods need.
(To avoid waiting 10 minutes, cancel the run once "Point LATEST" is green; nothing else is lost.)

**5.2 Check R2.** Dashboard > R2 > `kabir-blog-site`: a `releases/<sha>-<run>/` folder and a `LATEST` object.

---

## Part 6. The cluster (15 min)

All of this is in your **homelab-terraform** repo
(`~/Dev/terraform/homelab-terraform/homelab-terraform`, remote
`github.com/mursalinkabir/homelab-terraform`). The site repo never commits there; you do, by hand.

**6.1 Context check.**

```sh
kubectl config current-context        # admin@homelab-prod
kubectl -n gateway get gateway public # PROGRAMMED True
```

**6.2 Copy the draft manifests.**

```sh
cp -r ~/Dev/Projects/Kabir-Blog/kabir-blog/deploy/homelab-terraform/prod/apps/blog \
      ~/Dev/terraform/homelab-terraform/homelab-terraform/prod/apps/blog
cd ~/Dev/terraform/homelab-terraform/homelab-terraform
rm prod/apps/blog/README.md           # notes for you, not for the cluster
```

**6.3 Fill in your account id.** Open `prod/apps/blog/blog.yaml`, find
`RCLONE_CONFIG_R2_ENDPOINT`, and replace `<ACCOUNT_ID>` with the id from 2.2.
The image tag `0.1.0` (three lines) is already right.

> **Dry run instead of the apex?** In the HTTPRoute at the bottom set `sectionName: https-wildcard` and
> `hostnames: ['next.smkabir.com']`, use `next` as the subdomain in Part 7, and set the GitHub **variable**
> `SITE_URL` to `https://next.smkabir.com`. Repeat Parts 6 and 7 for the apex when you are ready.

**6.4 Seal the read-only R2 token** (values from 2.4; never commit the plain secret). `kubeseal` defaults to the
controller `sealed-secrets-controller` in `kube-system`, which is what your cluster runs:

```sh
kubectl create secret generic blog-r2 \
  --from-literal=RCLONE_CONFIG_R2_ACCESS_KEY_ID='PASTE_READ_ONLY_ACCESS_KEY_ID' \
  --from-literal=RCLONE_CONFIG_R2_SECRET_ACCESS_KEY='PASTE_READ_ONLY_SECRET' \
  --namespace blog --dry-run=client -o yaml \
 | kubeseal --format yaml > prod/apps/blog/r2-site.sealed.yaml
```

Open `r2-site.sealed.yaml` and add under `metadata:` (so it exists before the Deployment, like the ConfigMap):

```yaml
annotations:
  argocd.argoproj.io/sync-wave: '-2'
```

Check that the file contains `encryptedData:` and **no** plain values: `grep -c PASTE prod/apps/blog/*.yaml` prints 0.

**6.5 Commit and push.**

```sh
git add prod/apps/blog
git commit -m "blog: smkabir.com static site (kabir-blog-server 0.1.0)"
git push
```

**6.6 Wait for Argo CD** (up to 3 minutes; or Argo CD UI > ApplicationSet `apps` > **Refresh**), then:

```sh
kubectl -n blog get pods -o wide
kubectl -n blog logs deploy/blog -c content-sync | tail -5
```

**You should see:** two `blog-...` pods `2/2 Running`/Ready, and the log line `now serving <sha>-<run>`.
`0/2` Ready means the sidecar cannot read R2 (wrong token or endpoint): the log says which.

**6.7 Prove the cluster half before touching Cloudflare** (from a device on your home network):

```sh
curl -sS -w '\n%{http_code} verify=%{ssl_verify_result}\n' \
  --resolve smkabir.com:443:192.168.1.200 https://smkabir.com/version.json
```

**You should see:** a JSON body with the `build_id` from step 5.2, then `200 verify=0`.

---

## Part 7. Route smkabir.com to it in Cloudflare (10 min)

**7.1 Add the published route.** Cloudflare dashboard > **Zero Trust** > **Networks** > **Tunnels** >
**k8s-homelab** > **Published application routes** > **Add a published application route** (older dashboards call
it Public Hostnames). Fill in:

| Field                                                          | Value                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| Subdomain                                                      | leave **empty** (this is the apex)                    |
| Domain                                                         | `smkabir.com`                                         |
| Path                                                           | empty                                                 |
| Service > Type                                                 | `HTTPS`                                               |
| Service > URL                                                  | `cilium-gateway-public.gateway.svc.cluster.local:443` |
| Additional application settings > TLS > **Origin Server Name** | `smkabir.com`                                         |
| **No TLS Verify**                                              | leave **off**                                         |

Save.

**7.2 Check the DNS record exists.** Dashboard > `smkabir.com` > **DNS** > **Records**: a proxied (orange cloud)
**CNAME** named `smkabir.com` (shown as `@`) pointing at `<tunnel-id>.cfargotunnel.com`.
Cloudflare normally creates it for you. If it is **missing** (this is the one thing not verified for an apex), add
it yourself: Type `CNAME`, Name `@`, Target = the tunnel's `<tunnel-id>.cfargotunnel.com` (tunnel overview page),
Proxy status **Proxied**.

**7.3 Test from anywhere.**

```sh
curl -sI https://smkabir.com/ | head -12
```

**You should see:** `HTTP/2 200`, `content-security-policy: default-src 'self'; ...`, `x-content-type-options: nosniff`,
and `cache-control: public, max-age=0, s-maxage=86400`. Open https://smkabir.com in a browser.

If you get **404**: one of the two halves is missing (route in Cloudflare, or HTTPRoute in the cluster).
If **502/503**: the pods are not Ready (step 6.6).

---

## Part 8. Finish CI, then `www` (10 min)

**8.1 Finish the first publish.** GitHub > Actions > the **content** run > **Re-run failed jobs**.
The upload step now says "already uploaded and identical" and the run continues.

**You should see:** the whole run green: "Wait until the origin serves it" passes, `VERIFIED` is set, the cache is
purged, old releases are pruned.

**8.2 `www` goes to the apex.**

- DNS > Records > **Add record**: Type `CNAME`, Name `www`, Target `smkabir.com`, **Proxied**.
- **Rules** > **Redirect Rules** > **Create rule**: name `www to apex`; when **Hostname** equals `www.smkabir.com`;
  then **Dynamic** redirect, expression `concat("https://smkabir.com", http.request.uri.path)`, status **301**,
  **Preserve query string** on.
- Check: `curl -sI https://www.smkabir.com/about/` returns `301` and `location: https://smkabir.com/about/`.

**8.3 SSL mode.** `smkabir.com` > **SSL/TLS** > **Overview**: encryption mode **Full (strict)**.

---

## Part 9. Final checks

| Check                            | Command                                               | Expect                                                          |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Live release is the verified one | `curl -s https://smkabir.com/version.json`            | the `build_id` from the CI summary                              |
| Headers                          | `curl -sI https://smkabir.com/`                       | CSP, nosniff, referrer-policy, permissions-policy               |
| A missing page                   | `curl -sI https://smkabir.com/nope/`                  | `404` with the site's 404 page                                  |
| Directory redirect has no port   | `curl -sI https://smkabir.com/about`                  | `301`, `location: /about/`                                      |
| Japanese                         | open https://smkabir.com/ja/                          | Japanese home page                                              |
| Search                           | open https://smkabir.com/search/ and search "homelab" | results appear                                                  |
| Two pods, one lost               | `kubectl -n blog delete pod <one>` while reloading    | no failed requests                                              |
| Spread                           | `kubectl -n blog get pods -o wide`                    | two different nodes (needs the control-plane taint drift fixed) |

## From now on

| You want to                           | Do                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change a page, post or style          | edit, push to `main`. The **content** workflow publishes it; pods pick it up within about 2 minutes. No cluster commit.                               |
| Undo a bad content change             | Actions > **content-rollback** > Run workflow > an earlier `build_id` (look in R2 under `releases/`).                                                 |
| Change nginx, headers, or the sidecar | add a CHANGELOG entry, tag `vX.Y.Z`, push the tag; then bump the image tag (three lines) in `prod/apps/blog/blog.yaml` in homelab-terraform and push. |
| Undo a bad image                      | `git revert` that bump commit in homelab-terraform.                                                                                                   |
| Take the site offline fast            | Zero Trust > Tunnels > k8s-homelab > Published application routes > delete the `smkabir.com` row (the cluster is untouched; re-add it to restore).    |

## If something is off

| You see                                      | Likely cause and fix                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `release` fails at "CHANGELOG has an entry"  | step 4.1: the heading must be `## 0.1.0 ...`                                                                             |
| `release` fails at trivy                     | a fixable HIGH/CRITICAL in the base image; send me the finding                                                           |
| Pods `ImagePullBackOff`                      | package still private (4.4), or the tag does not exist                                                                   |
| Pods Running but `0/2` Ready                 | sidecar cannot read R2: `kubectl -n blog logs deploy/blog -c content-sync`; check the account id and the read-only token |
| `curl smkabir.com` gives 404 from Cloudflare | route missing (7.1)                                                                                                      |
| `curl smkabir.com` gives 404 from Envoy      | HTTPRoute not applied or wrong `sectionName` (apex must be `https-apex`)                                                 |
| `curl smkabir.com` gives 502/503             | pods not Ready, or Origin Server Name is not `smkabir.com`                                                               |
| DNS does not resolve                         | step 7.2 manual CNAME                                                                                                    |
| CI "Wait until the origin serves it" fails   | the site is not reachable yet, or `SITE_URL` points elsewhere; the release is safe in R2, re-run when fixed              |
| Redirects not applied                        | sidecar log says "could not signal nginx": the pod needs `shareProcessNamespace` (it is in the manifest)                 |
