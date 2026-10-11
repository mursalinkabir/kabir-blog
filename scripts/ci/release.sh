#!/bin/sh
# Publishes site releases to the R2 bucket. Used by .github/workflows/content.yml and content-rollback.yml.
# This script is the only place that knows the bucket layout (docs/PLAN.md, "Build and CI/CD"):
#
#   releases/<build_id>/...   one immutable folder per release
#   LATEST                    one line: the id the pods should serve
#   VERIFIED                  one line: the id CI saw live on the origin (what the failover Worker serves)
#
#   release.sh upload   <dist-dir> <build_id>        copy a build to releases/<build_id>/ (pointers untouched)
#   release.sh point    LATEST|VERIFIED <build_id>   move a pointer
#   release.sh verify-live <version-url> <build_id> [timeout-seconds]
#   release.sh prune    <keep>                       delete the oldest releases, never LATEST or VERIFIED
#   release.sh rollback <build_id>                   point LATEST and VERIFIED at an existing release
#   release.sh exists   <build_id>
#   release.sh check                                    can the bucket be read with these credentials? (also run first by upload/point/prune/rollback)
#
# Environment: BUCKET (rclone path, default r2:kabir-blog-site). rclone reads its R2 credentials from RCLONE_CONFIG_R2_*.
# Pointers move only after every file of a release is uploaded and re-checked, so a pod can never see a half release.
set -eu

BUCKET="${BUCKET:-r2:kabir-blog-site}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-/dev/null}"

die() { echo "release.sh: $*" >&2; exit 1; }
say() { echo "release.sh: $*"; }

valid_id() {
  case "$1" in
    '' | . | .. | .* | *[!A-Za-z0-9._-]*) return 1 ;;
  esac
  [ "${#1}" -le 80 ]
}
# Fails with the reason, not just exit 1. Without this a missing secret, a wrong account id, a bucket that does not exist
# and a token with the wrong scope all look the same in the logs ("Process completed with exit code 1").
preflight() {
  err=$(rclone lsf "$BUCKET" --max-depth 1 2>&1 >/dev/null) && return 0
  {
    echo "release.sh: cannot read the bucket $BUCKET with the credentials in this environment."
    echo "rclone said:"
    printf '%s\n' "$err" | head -8 | sed 's/^/    /'
    echo "Usual causes, in order:"
    echo "  - a secret in the site-publish environment is missing or misspelled (R2_ACCOUNT_ID, R2_SITE_WRITE_ACCESS_KEY_ID,"
    echo "    R2_SITE_WRITE_SECRET_ACCESS_KEY): docs/secrets.md lists the exact names;"
    echo "  - the bucket does not exist, or its name differs from the R2_SITE_BUCKET variable (default kabir-blog-site);"
    echo "  - the token was not created for this bucket, or has Object Read only instead of Read & Write;"
    echo "  - R2_ACCOUNT_ID is not the account that owns the bucket."
  } >&2
  exit 1
}

need_id() { valid_id "$1" || die "invalid build id '$1' (letters, digits, dot, dash, underscore; max 80)"; }
read_pointer() { rclone cat "$BUCKET/$1" 2>/dev/null | head -c 200 | tr -d '[:space:]' || true; }
release_exists() { [ -n "$(rclone lsf "$BUCKET/releases/$1" --max-depth 1 2>/dev/null | head -1)" ]; }

cmd_upload() {
  dist=${1:?dist dir}; id=${2:?build id}
  need_id "$id"
  preflight
  [ -d "$dist" ] || die "$dist is not a directory"
  [ -f "$dist/index.html" ] || die "$dist/index.html is missing: refusing to publish an empty site"
  built=$(jq -er '.build_id' "$dist/version.json" 2>/dev/null) || die "$dist/version.json is missing or invalid"
  [ "$built" = "$id" ] || die "version.json says '$built' but the release is '$id'"
  # Releases are immutable: different content under an id that exists would silently change a published site.
  # An identical re-upload is fine: it is what "re-run failed jobs" does after the publish job stopped waiting.
  if release_exists "$id"; then
    rclone check "$dist" "$BUCKET/releases/$id" --checksum --quiet >/dev/null 2>&1 \
      || die "release $id already exists with different content; build ids are never reused"
    say "release $id is already uploaded and identical; nothing to do"
    return 0
  fi

  say "uploading $dist -> $BUCKET/releases/$id"
  rclone copy "$dist" "$BUCKET/releases/$id" --checksum --transfers 16 --immutable
  say "verifying upload"
  rclone check "$dist" "$BUCKET/releases/$id" --one-way --checksum --quiet >/dev/null
  say "release $id uploaded and verified ($(rclone size "$BUCKET/releases/$id" --json | jq -r '"\(.count) files, \(.bytes) bytes"'))"
}

cmd_point() {
  name=${1:?LATEST or VERIFIED}; id=${2:?build id}
  case "$name" in LATEST | VERIFIED) ;; *) die "pointer must be LATEST or VERIFIED" ;; esac
  need_id "$id"
  preflight
  release_exists "$id" || die "release $id does not exist; refusing to point $name at it"
  printf '%s\n' "$id" | rclone rcat "$BUCKET/$name"
  [ "$(read_pointer "$name")" = "$id" ] || die "$name did not read back as $id"
  say "$name -> $id"
}

cmd_verify_live() {
  url=${1:?version.json url}; id=${2:?build id}; timeout=${3:-600}
  need_id "$id"
  waited=0
  while [ "$waited" -le "$timeout" ]; do
    got=$(wget -qO- -T 10 "$url" 2>/dev/null | jq -r '.build_id' 2>/dev/null || true)
    if [ "$got" = "$id" ]; then
      say "$url reports $id after ${waited}s"
      return 0
    fi
    sleep 10
    waited=$((waited + 10))
  done
  die "$url did not report $id within ${timeout}s (last saw '${got:-nothing}')"
}

cmd_prune() {
  keep=${1:?number of releases to keep}
  case "$keep" in '' | *[!0-9]*) die "keep must be a number" ;; esac
  [ "$keep" -ge 2 ] || die "keep at least 2 releases (the live one and a rollback target)"
  preflight
  latest=$(read_pointer LATEST); verified=$(read_pointer VERIFIED)
  # Order by the run id after the last dash (<sha>-<run_id>), oldest first. Ids without one sort first.
  ids=$(rclone lsf "$BUCKET/releases" --dirs-only 2>/dev/null | sed 's|/$||' | awk -F- '{ n = $NF; if (n !~ /^[0-9]+$/) n = 0; printf "%020d %s\n", n, $0 }' | sort | cut -d' ' -f2)
  total=$(printf '%s\n' "$ids" | grep -c . || true)
  [ "$total" -gt "$keep" ] || { say "$total releases, nothing to prune"; return 0; }
  drop=$((total - keep))
  printf '%s\n' "$ids" | head -n "$drop" | while read -r id; do
    [ -n "$id" ] || continue
    if [ "$id" = "$latest" ] || [ "$id" = "$verified" ]; then say "keeping $id (referenced by a pointer)"; continue; fi
    rclone purge "$BUCKET/releases/$id" && say "pruned $id"
  done
}

cmd_rollback() {
  id=${1:?build id}
  need_id "$id"
  preflight
  release_exists "$id" || die "release $id does not exist"
  built=$(rclone cat "$BUCKET/releases/$id/version.json" 2>/dev/null | jq -er '.build_id') || die "release $id has no valid version.json"
  [ "$built" = "$id" ] || die "release $id contains version.json for '$built'"
  cmd_point LATEST "$id"
  cmd_point VERIFIED "$id"
}

cmd_exists() { release_exists "${1:?build id}" && say "$1 exists" || die "release $1 does not exist"; }

sub=${1:-}
[ -n "$sub" ] && shift
case "$sub" in
  upload) cmd_upload "$@" ;;
  point) cmd_point "$@" ;;
  verify-live) cmd_verify_live "$@" ;;
  prune) cmd_prune "$@" ;;
  rollback) cmd_rollback "$@" ;;
  exists) cmd_exists "$@" ;;
  check) preflight; say "bucket $BUCKET is readable with these credentials" ;;
  *) die "usage: release.sh upload|point|verify-live|prune|rollback|exists|check ..." ;;
esac
