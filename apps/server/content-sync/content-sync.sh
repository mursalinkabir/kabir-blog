#!/bin/sh
# content-sync: keeps /srv/site/current pointing at the newest verified release in R2.
#
#   content-sync            run forever (poll LATEST every POLL_SECONDS)
#   content-sync once       one poll, then exit (tests, debugging)
#   content-sync init       create the directories and an empty redirect map, then exit (init container)
#
# Contract with the publisher (scripts/ci/release.sh): a release is the folder `releases/<build_id>/` plus a
# one-line pointer object `LATEST` holding <build_id>. The pointer is written only after every file of the release
# is uploaded, so a half-uploaded release is never visible here. This script still re-checks what it downloaded.
#
# Safe by construction:
#   - the id from LATEST is validated before it is used in any path;
#   - a release is downloaded beside the live one and renamed into place only after it passes checks;
#   - the `current` symlink is swapped atomically (rename), so a request never sees a half-written site;
#   - any failure leaves the previous release serving. R2 down means "keep what you have".
#
# Environment:
#   REMOTE          required. rclone path of the bucket, e.g. r2:smkabir-site (or a local directory in tests)
#   SITE_ROOT       default /srv/site
#   POLL_SECONDS    default 60
#   KEEP_RELEASES   default 2 (the live release and the previous one, for instant local rollback)
#   NGINX_PID_FILE  default /tmp/nginx.pid (same pod, shared PID namespace and /tmp)
#   RCLONE_*        rclone's own environment configuration (access keys, endpoint)

set -u

ROOT="${SITE_ROOT:-/srv/site}"
POLL="${POLL_SECONDS:-60}"
KEEP="${KEEP_RELEASES:-2}"
PIDFILE="${NGINX_PID_FILE:-/tmp/nginx.pid}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-/tmp/rclone.conf}"

log() { printf '%s content-sync: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# Release ids look like <git sha>-<run id>. Nothing that could climb out of $ROOT is accepted.
valid_id() {
  case "$1" in
    '' | . | .. | .* | *[!A-Za-z0-9._-]*) return 1 ;;
  esac
  [ "${#1}" -le 80 ]
}

current_id() {
  # basename of the symlink target, or empty when there is no release yet
  target=$(readlink "$ROOT/current" 2>/dev/null) || return 0
  basename "$target"
}

# Turn a release's _redirects.json ([{"from":"/old/","to":"/new/"}]) into nginx `map` lines.
# Only a conservative character set gets through, so a bad entry can never inject nginx config.
render_redirects() {
  src=$1 out=$2
  if [ ! -f "$src" ]; then
    : >"$out"
    return 0
  fi
  jq -er '
    def safe_from: test("^/[A-Za-z0-9._~%/-]*$");
    def safe_to:   test("^/[A-Za-z0-9._~%/#?=&-]*$") and (startswith("//") | not)
                   or test("^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~%/#?=&-]*)?$");
    if type != "array" then error("not an array")
    elif length > 5000 then error("too many redirects")
    else .[]
      | select((.from | type) == "string" and (.to | type) == "string")
      | select((.from | safe_from) and (.to | safe_to))
      | "\"\(.from)\" \"\(.to)\";"
    end' "$src" >"$out"
}

reload_nginx() {
  if [ ! -r "$PIDFILE" ]; then
    # Normal on first start: this sidecar runs before nginx, and nginx reads the redirect map when it starts.
    log "nginx is not running yet; it will read the redirect map at start"
  elif kill -HUP "$(cat "$PIDFILE")" 2>/dev/null; then
    log "nginx reloaded"
  else
    log "WARNING: could not signal nginx ($PIDFILE); check shareProcessNamespace and the shared /tmp; redirects apply at the next nginx restart"
  fi
}

# Keep the live release plus the newest others up to KEEP; everything else (and crash leftovers) goes.
prune() {
  live=$1 kept=1
  for name in $(ls -1t "$ROOT" 2>/dev/null); do
    case "$name" in
      current | _redirects.conf | _redirects.conf.next | "$live") continue ;;
    esac
    [ -d "$ROOT/$name" ] || continue
    if [ "$kept" -lt "$KEEP" ]; then
      kept=$((kept + 1))
    else
      rm -rf "$ROOT/$name" && log "removed old release $name"
    fi
  done
}

init() {
  mkdir -p "$ROOT"
  [ -f "$ROOT/_redirects.conf" ] || : >"$ROOT/_redirects.conf"
  rm -rf "$ROOT"/.incoming-* "$ROOT"/.current.new "$ROOT"/_redirects.conf.next 2>/dev/null
}

reject() {
  log "rejected release $1: $2"
  rm -rf "$ROOT/.incoming-$1" "$ROOT/_redirects.conf.next"
}

sync_once() {
  latest=$(rclone cat "$REMOTE/LATEST" 2>/dev/null | head -c 200 | tr -d '[:space:]')
  if [ -z "$latest" ]; then
    log "LATEST unreadable or empty; keeping '$(current_id)'"
    return 0
  fi
  if ! valid_id "$latest"; then
    log "LATEST holds an invalid id; keeping '$(current_id)'"
    return 0
  fi
  [ "$latest" = "$(current_id)" ] && return 0

  tmp="$ROOT/.incoming-$latest"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  if ! rclone copy "$REMOTE/releases/$latest" "$tmp" --checksum --transfers 8 --retries 3 --low-level-retries 5 >/dev/null 2>&1; then
    reject "$latest" "download failed"
    return 0
  fi
  [ -f "$tmp/index.html" ] || { reject "$latest" "no index.html"; return 0; }
  built=$(jq -er '.build_id' "$tmp/version.json" 2>/dev/null) || { reject "$latest" "version.json missing or invalid"; return 0; }
  [ "$built" = "$latest" ] || { reject "$latest" "version.json says '$built'"; return 0; }
  render_redirects "$tmp/_redirects.json" "$ROOT/_redirects.conf.next" || { reject "$latest" "redirect file invalid"; return 0; }
  rm -f "$tmp/_redirects.json" # rendered above; no reason to publish the list

  rm -rf "${ROOT:?}/$latest"
  mv "$tmp" "$ROOT/$latest" || { reject "$latest" "could not move into place"; return 0; }
  ln -sfn "$latest" "$ROOT/.current.new" && mv -T "$ROOT/.current.new" "$ROOT/current" || { log "could not swap current"; return 0; }
  mv -f "$ROOT/_redirects.conf.next" "$ROOT/_redirects.conf"
  reload_nginx
  prune "$latest"
  log "now serving $latest"
}

main() {
  case "${1:-run}" in
    init)
      init
      ;;
    once)
      : "${REMOTE:?REMOTE is required, e.g. r2:smkabir-site}"
      init
      sync_once
      ;;
    run)
      : "${REMOTE:?REMOTE is required, e.g. r2:smkabir-site}"
      init
      trap 'log "stopping"; exit 0' TERM INT
      log "watching $REMOTE every ${POLL}s"
      while :; do
        sync_once
        sleep "$POLL" &
        wait $!
      done
      ;;
    *)
      echo "usage: content-sync [run|once|init]" >&2
      exit 2
      ;;
  esac
}

main "$@"
