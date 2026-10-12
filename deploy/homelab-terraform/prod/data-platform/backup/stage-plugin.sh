#!/usr/bin/env bash
# Fetches the Barman Cloud plugin manifest, verifies its SHA-256, and writes it into homelab-terraform as
# prod/data-platform/07-barman-cloud-plugin.yaml. Production-ready. Re-run with a new VERSION and SHA256 to bump.
# It installs a CRD, RBAC and one Deployment in cnpg-system, next to the operator, and uses cert-manager for its TLS.
# It does not touch pg-main: nothing restarts until the Cluster gains spec.plugins (README.md).
set -euo pipefail

VERSION="${VERSION:-v0.15.1}"
SHA256="${SHA256:-8f377ff4a7d0d3f74fc64b0f7ac4f449fc38ca9e83a40107cca2f9315a9bd920}"
HOMELAB_DIR="${HOMELAB_DIR:-$HOME/Dev/terraform/homelab-terraform/homelab-terraform}"
OUT="$HOMELAB_DIR/prod/data-platform/07-barman-cloud-plugin.yaml"
URL="https://github.com/cloudnative-pg/plugin-barman-cloud/releases/download/$VERSION/manifest.yaml"

tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
curl -fsSL -o "$tmp" "$URL"
got="$(shasum -a 256 "$tmp" | cut -d' ' -f1)"
[ "$got" = "$SHA256" ] || { echo "stage-plugin: SHA-256 mismatch for $URL (got $got)" >&2; exit 1; }
{
  echo "# Barman Cloud plugin $VERSION, unmodified from:"
  echo "#   $URL"
  echo "#   sha256 $SHA256"
  echo "# Staged by kabir-blog/deploy/homelab-terraform/prod/data-platform/backup/stage-plugin.sh."
  cat "$tmp"
} >"$OUT"
echo "stage-plugin: wrote $OUT"
