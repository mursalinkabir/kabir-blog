#!/usr/bin/env bash
# Seals the R2 token for pg-main backups into homelab-terraform/prod/data-platform/08-pg-backups-r2.sealed.yaml.
# Production-ready. Run it yourself: it prompts, hides the secret, and needs only kubeseal and the public certificate.
# The token is Object Read & Write on the bucket kabir-blog-pg-backups only (not the release or media tokens).
set -euo pipefail

HOMELAB_DIR="${HOMELAB_DIR:-$HOME/Dev/terraform/homelab-terraform/homelab-terraform}"
CERT="$HOMELAB_DIR/prod/data-platform/pub-cert.pem"
OUT="$HOMELAB_DIR/prod/data-platform/08-pg-backups-r2.sealed.yaml"

[ -f "$CERT" ] || { echo "seal-pg-backups: $CERT not found (set HOMELAB_DIR)" >&2; exit 1; }
command -v kubeseal >/dev/null || { echo "seal-pg-backups: kubeseal is required" >&2; exit 1; }
[ ! -e "$OUT" ] || { echo "seal-pg-backups: $OUT exists; delete it first to rotate" >&2; exit 1; }

read -r -p "Backups bucket Access Key ID : " KEY_ID
read -r -s -p "Backups bucket Secret Access Key (hidden): " SECRET; echo
[ -n "$KEY_ID" ] && [ -n "$SECRET" ] || { echo "seal-pg-backups: both values are required" >&2; exit 1; }
[[ "$KEY_ID" =~ ^[0-9a-f]{32}$ ]] || echo "seal-pg-backups: WARNING: the key id is not 32 hex characters" >&2
[[ "$SECRET" =~ ^[0-9a-f]{64}$ ]] || echo "seal-pg-backups: WARNING: the secret is not 64 hex characters" >&2

tmp="$(mktemp)"
trap 'rm -f "$tmp"; unset SECRET KEY_ID' EXIT
cat <<YAML | kubeseal --cert "$CERT" --format yaml \
  | awk 'BEGIN{d=0} {print} /^metadata:/ && !d {print "  annotations:\n    argocd.argoproj.io/sync-wave: \x27-1\x27"; d=1}' >"$tmp"
apiVersion: v1
kind: Secret
metadata:
  name: pg-backups-r2
  namespace: platform
type: Opaque
stringData:
  ACCESS_KEY_ID: "$KEY_ID"
  ACCESS_SECRET_KEY: "$SECRET"
YAML
grep -q '^  encryptedData:' "$tmp" || { echo "seal-pg-backups: no encryptedData; not trusting it" >&2; exit 1; }
if grep -qF -e "$SECRET" -e "$KEY_ID" "$tmp"; then echo "seal-pg-backups: plain value in output" >&2; exit 1; fi
mv "$tmp" "$OUT"; echo "seal-pg-backups: wrote $OUT"
