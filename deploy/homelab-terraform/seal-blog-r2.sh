#!/usr/bin/env bash
# Seals the read-only R2 token for the blog pods into homelab-terraform/prod/apps/blog/r2-site.sealed.yaml.
# Production-ready. Run it yourself: it prompts for the two values (the secret is not echoed, not put in shell
# history, not written anywhere in plain text) and needs kubectl + kubeseal pointed at the homelab-prod cluster.
#
#   bash deploy/homelab-terraform/seal-blog-r2.sh            # HOMELAB_DIR defaults to the checkout below
#   HOMELAB_DIR=/path/to/homelab-terraform bash ...
#
# The values are the Access Key ID and Secret Access Key of the *pod* token (docs/go-live.md 2.4): Object Read only,
# bucket kabir-blog-site only. Not the CI write token.
set -euo pipefail

HOMELAB_DIR="${HOMELAB_DIR:-$HOME/Dev/terraform/homelab-terraform/homelab-terraform}"
OUT="$HOMELAB_DIR/prod/apps/blog/r2-site.sealed.yaml"
NAMESPACE=blog
NAME=blog-r2

[ -d "$HOMELAB_DIR/prod/apps" ] || { echo "seal-blog-r2: $HOMELAB_DIR/prod/apps not found (set HOMELAB_DIR)" >&2; exit 1; }
[ -d "$HOMELAB_DIR/prod/apps/blog" ] || { echo "seal-blog-r2: prod/apps/blog is missing; copy the draft manifests first" >&2; exit 1; }
command -v kubectl >/dev/null && command -v kubeseal >/dev/null || { echo "seal-blog-r2: kubectl and kubeseal are required" >&2; exit 1; }
ctx=$(kubectl config current-context)
[ "$ctx" = "admin@homelab-prod" ] || { echo "seal-blog-r2: kubectl context is '$ctx', expected admin@homelab-prod" >&2; exit 1; }

read -r -p "Read-only Access Key ID : " KEY_ID
read -r -s -p "Read-only Secret Access Key (hidden): " SECRET; echo
[ -n "$KEY_ID" ] && [ -n "$SECRET" ] || { echo "seal-blog-r2: both values are required" >&2; exit 1; }
# R2 key ids are 32 hex characters and secrets 64: catches a swapped or truncated paste before it is sealed.
[[ "$KEY_ID" =~ ^[0-9a-f]{32}$ ]] || echo "seal-blog-r2: WARNING: the key id is not 32 hex characters; check it is the Access Key ID" >&2
[[ "$SECRET" =~ ^[0-9a-f]{64}$ ]] || echo "seal-blog-r2: WARNING: the secret is not 64 hex characters; check you copied all of it" >&2

tmp=$(mktemp)
trap 'rm -f "$tmp"; unset SECRET KEY_ID' EXIT

kubectl create secret generic "$NAME" --namespace "$NAMESPACE" \
  --from-literal=RCLONE_CONFIG_R2_ACCESS_KEY_ID="$KEY_ID" \
  --from-literal=RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$SECRET" \
  --dry-run=client -o yaml | kubeseal --format yaml >"$tmp"

# Created before the Deployment, like the ConfigMap (sync-wave -2). Insert under the top-level metadata only.
awk 'BEGIN{done=0} {print} /^metadata:/ && !done {print "  annotations:\n    argocd.argoproj.io/sync-wave: \x27-2\x27"; done=1}' "$tmp" >"$OUT"

grep -q '^  encryptedData:' "$OUT" || { echo "seal-blog-r2: output has no encryptedData; not trusting it" >&2; rm -f "$OUT"; exit 1; }
if grep -qF -e "$SECRET" -e "$KEY_ID" "$OUT"; then echo "seal-blog-r2: plain value found in output; removed" >&2; rm -f "$OUT"; exit 1; fi
echo "seal-blog-r2: wrote $OUT"
echo "Next: review it, then commit prod/apps/blog and push (docs/go-live.md 6.5)."
