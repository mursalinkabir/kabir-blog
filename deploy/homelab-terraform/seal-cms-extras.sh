#!/usr/bin/env bash
# Seals the CMS's media-bucket credentials and (optionally) the GitHub dispatch token. Production-ready.
# Run it yourself: it prompts, hides the secrets, and needs only kubeseal and the public certificate; it never
# contacts the cluster.
#
#   bash deploy/homelab-terraform/seal-cms-extras.sh           # HOMELAB_DIR defaults to the checkout below
#
# Writes prod/apps/cms/media.sealed.yaml (S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) and, when you
# give a token, prod/apps/cms/github.sealed.yaml (GITHUB_DISPATCH_TOKEN). The R2 token is the *media* bucket's
# Object Read & Write token, not the CI release token and not the read-only pod token.
set -euo pipefail

HOMELAB_DIR="${HOMELAB_DIR:-$HOME/Dev/terraform/homelab-terraform/homelab-terraform}"
CERT="$HOMELAB_DIR/prod/data-platform/pub-cert.pem"
DIR="$HOMELAB_DIR/prod/apps/cms"
MEDIA_OUT="$DIR/media.sealed.yaml"
GITHUB_OUT="$DIR/github.sealed.yaml"
BUCKET="${MEDIA_BUCKET:-kabir-blog-media}"

[ -f "$CERT" ] || { echo "seal-cms-extras: $CERT not found (set HOMELAB_DIR)" >&2; exit 1; }
command -v kubeseal >/dev/null || { echo "seal-cms-extras: kubeseal is required" >&2; exit 1; }
mkdir -p "$DIR"

read -r -p "Cloudflare account id (32 hex, not secret): " ACCOUNT_ID
[[ "$ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]] || { echo "seal-cms-extras: account id is not 32 hex characters" >&2; exit 1; }
read -r -p "Media bucket Access Key ID : " KEY_ID
read -r -s -p "Media bucket Secret Access Key (hidden): " SECRET; echo
read -r -s -p "GitHub dispatch token (hidden, empty to skip): " GH_TOKEN; echo
[ -n "$KEY_ID" ] && [ -n "$SECRET" ] || { echo "seal-cms-extras: key id and secret are required" >&2; exit 1; }
[[ "$KEY_ID" =~ ^[0-9a-f]{32}$ ]] || echo "seal-cms-extras: WARNING: the key id is not 32 hex characters" >&2
[[ "$SECRET" =~ ^[0-9a-f]{64}$ ]] || echo "seal-cms-extras: WARNING: the secret is not 64 hex characters" >&2

tmp_media="$(mktemp)"; tmp_gh="$(mktemp)"
trap 'rm -f "$tmp_media" "$tmp_gh"; unset SECRET KEY_ID GH_TOKEN' EXIT
annotate() { awk 'BEGIN{d=0} {print} /^metadata:/ && !d {print "  annotations:\n    argocd.argoproj.io/sync-wave: \x27-2\x27"; d=1}'; }

cat <<YAML | kubeseal --cert "$CERT" --format yaml | annotate >"$tmp_media"
apiVersion: v1
kind: Secret
metadata:
  name: cms-media
  namespace: cms
type: Opaque
stringData:
  S3_BUCKET: "$BUCKET"
  S3_ENDPOINT: "https://$ACCOUNT_ID.r2.cloudflarestorage.com"
  S3_ACCESS_KEY_ID: "$KEY_ID"
  S3_SECRET_ACCESS_KEY: "$SECRET"
YAML
grep -q '^  encryptedData:' "$tmp_media" || { echo "seal-cms-extras: no encryptedData; not trusting it" >&2; exit 1; }
if grep -qF -e "$SECRET" -e "$KEY_ID" "$tmp_media"; then echo "seal-cms-extras: plain value in output" >&2; exit 1; fi
mv "$tmp_media" "$MEDIA_OUT"; echo "seal-cms-extras: wrote $MEDIA_OUT"

if [ -n "$GH_TOKEN" ]; then
  cat <<YAML | kubeseal --cert "$CERT" --format yaml | annotate >"$tmp_gh"
apiVersion: v1
kind: Secret
metadata:
  name: cms-github
  namespace: cms
type: Opaque
stringData:
  GITHUB_DISPATCH_TOKEN: "$GH_TOKEN"
YAML
  grep -q '^  encryptedData:' "$tmp_gh" || { echo "seal-cms-extras: no encryptedData; not trusting it" >&2; exit 1; }
  if grep -qF -e "$GH_TOKEN" "$tmp_gh"; then echo "seal-cms-extras: plain value in output" >&2; exit 1; fi
  mv "$tmp_gh" "$GITHUB_OUT"; echo "seal-cms-extras: wrote $GITHUB_OUT"
else
  echo "seal-cms-extras: no GitHub token given; publishing will save but not rebuild the site"
fi
echo "Next: bump kabir-blog/secrets-rev in cms.yaml, commit prod/apps/cms, push."
