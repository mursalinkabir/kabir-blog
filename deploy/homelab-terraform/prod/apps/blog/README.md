# prod/apps/blog (draft)

Step-by-step: `docs/go-live.md` in kabir-blog. This README is the short reference.

Copy this folder into `homelab-terraform/prod/apps/blog/` by hand. It is plain YAML, sets no namespace, and
has no `Namespace` object (the `apps` ApplicationSet owns both). Full runbook: `docs/deploy.md` in kabir-blog.

## What you still have to supply

| Item                                     | Where                                                    | How                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Cloudflare account id                    | `blog.yaml` ConfigMap `RCLONE_CONFIG_R2_ENDPOINT`        | replace `<ACCOUNT_ID>` (not a secret)                                                                                 |
| Read-only R2 token for `kabir-blog-site` | SealedSecret `blog-r2` (below)                           | Cloudflare dashboard: R2 > API tokens, **Object Read only**, this bucket only                                         |
| The image tag                            | the three `image:` lines                                 | `0.1.1` is the first image (`v0.1.0` never built one: see CHANGELOG); push a new tag for later versions in kabir-blog |
| Public GHCR package                      | GitHub: Packages > kabir-blog-server > visibility Public | the image holds no content or secrets; the pods pull it without a pull secret                                         |
| Tunnel route                             | Cloudflare dashboard (below)                             | after the HTTPRoute exists                                                                                            |

## The SealedSecret (never commit the plain Secret)

```sh
# Run on the machine that can reach the cluster's sealed-secrets controller. Illustrative: adapt the
# controller name and namespace to your install (the TraderBuddy secret was made the same way).
kubectl create secret generic blog-r2 \
  --from-literal=RCLONE_CONFIG_R2_ACCESS_KEY_ID='<read-only access key id>' \
  --from-literal=RCLONE_CONFIG_R2_SECRET_ACCESS_KEY='<read-only secret>' \
  --dry-run=client -o yaml \
 | kubeseal --namespace blog --format yaml \
 > r2-site.sealed.yaml
```

Add this annotation to the generated `metadata` so it exists before the Deployment (same ordering the
ConfigMap uses), then commit `r2-site.sealed.yaml` next to `blog.yaml`:

```yaml
annotations:
  argocd.argoproj.io/sync-wave: '-2'
```

## Cloudflare tunnel route (dashboard, `k8s-homelab` > Published application routes)

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| Subdomain          | empty (the apex)                                      |
| Domain             | `smkabir.com`                                         |
| Service type       | `HTTPS`                                               |
| Service URL        | `cilium-gateway-public.gateway.svc.cluster.local:443` |
| Origin Server Name | `smkabir.com`                                         |

Then confirm a proxied CNAME for the apex exists (Cloudflare normally creates it; if not, point `@` at
`<tunnel-id>.cfargotunnel.com`, proxied). Add `www` as a proxied CNAME to `smkabir.com` plus a 301 Redirect Rule to
the apex. For a dry run first, use `next.smkabir.com` with `https-wildcard` in the HTTPRoute. Click-by-click:
`docs/go-live.md`.
