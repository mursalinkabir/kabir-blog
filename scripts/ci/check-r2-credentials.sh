#!/usr/bin/env bash
# Tests an R2 Access Key ID / Secret Access Key pair against a bucket BEFORE it is pasted into GitHub or sealed.
# Production-ready. Run it yourself; the secret is read hidden and never written anywhere. Needs only curl (8.3+).
#
#   bash scripts/ci/check-r2-credentials.sh [bucket]        # default bucket: kabir-blog-site
#
# What the answer means:
#   200  the pair works for listing this bucket (a good CI write token also passes the write test below)
#   401  the Access Key ID does not exist (a typo, or the token value was pasted where the ID goes)
#   403  SignatureDoesNotMatch: the secret does not belong to that key ID (typo, truncated, or the Token value
#        pasted instead of the Secret Access Key)
#   403  AccessDenied: the key is fine but the token is not allowed on this bucket (scope or permission)
#   404  NoSuchBucket: wrong bucket name, or the account id is not the bucket's account
set -euo pipefail

BUCKET="${1:-kabir-blog-site}"
read -r -p "Cloudflare Account ID: " ACCOUNT
read -r -p "Access Key ID: " KEY
read -r -s -p "Secret Access Key (hidden): " SECRET; echo
trap 'unset SECRET KEY' EXIT

sha256() { if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
is_hex() { [[ "$1" =~ ^[0-9a-f]{$2}$ ]]; }

echo
is_hex "$KEY" 32 && echo "key id: 32 hex characters (as expected)" || echo "key id: NOT 32 hex characters (it should be; check it is the Access Key ID, not the Token value)"
is_hex "$SECRET" 64 && echo "secret: 64 hex characters (as expected)" || echo "secret: NOT 64 hex characters (the S3 secret is exactly 64; a Token value is not)"

url="https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}"
try() { # label, secret -> prints the verdict and returns 0 on success
  local label=$1 sec=$2 body code
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' --aws-sigv4 "aws:amz:auto:s3" --user "${KEY}:${sec}" "${url}?list-type=2&max-keys=1" || echo "000")
  printf '%s: HTTP %s %s\n' "$label" "$code" "$(sed -n 's/.*<Code>\([^<]*\)<\/Code>.*/\1/p' "$body")"
  rm -f "$body"
  [ "$code" = 200 ]
}

if try "list ${BUCKET}" "$SECRET"; then
  echo "OK: this pair can list the bucket."
  exit 0
fi
# A very common mix-up: the 'Token value' was saved, and the S3 secret is its SHA-256.
if ! is_hex "$SECRET" 64; then
  derived=$(printf '%s' "$SECRET" | sha256)
  echo "Trying the SHA-256 of what you entered (the S3 secret is the SHA-256 of the Token value)..."
  if try "list ${BUCKET} with SHA-256 secret" "$derived"; then
    echo "OK with the derived secret. Use this value as the Secret Access Key instead:"
    echo "  $derived"
    echo "(it is a secret: paste it straight into GitHub, do not keep it in notes or chat)"
    exit 0
  fi
fi
echo "FAILED. See the table at the top of this script for what the code means." >&2
exit 1
