#!/usr/bin/env bash
# Image tests for smkabir-site-server. Needs only Docker. Builds the image, then checks:
#   1. the content-sync sidecar against a fake bucket (rclone's local backend stands in for R2)
#   2. nginx under the restrictions the cluster enforces (non-root, read-only root, no capabilities)
#   3. the two together, sharing a PID namespace like the pod does (redirects reload)
#
#   apps/server/tests/run.sh                 # builds for the host platform
#   PLATFORM=linux/amd64 apps/server/tests/run.sh
#
# Exit code 1 if any check fails.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

IMAGE="${IMAGE:-smkabir-site-server:test}"
PLATFORM="${PLATFORM:-}"
RUN_ID="t$$"
BUCKET="ssbucket-$RUN_ID"; SITE="sssite-$RUN_ID"; TMPV="sstmp-$RUN_ID"
pass=0; fail=0
platform_args=(); [ -n "$PLATFORM" ] && platform_args=(--platform "$PLATFORM")

cleanup() {
  docker rm -f "ss-nginx-$RUN_ID" "ss-sync-$RUN_ID" >/dev/null 2>&1
  docker volume rm -f "$BUCKET" "$SITE" "$TMPV" >/dev/null 2>&1
}
trap cleanup EXIT

ok() { # name, command...
  local name=$1; shift
  if "$@" >/dev/null 2>&1; then pass=$((pass + 1)); echo "  PASS  $name"; else fail=$((fail + 1)); echo "  FAIL  $name"; fi
}
eq() { # name, expected, actual
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "  PASS  $1"; else fail=$((fail + 1)); echo "  FAIL  $1 (expected '$2', got '$3')"; fi
}
contains() { # name, haystack, needle
  case "$2" in *"$3"*) pass=$((pass + 1)); echo "  PASS  $1" ;; *) fail=$((fail + 1)); echo "  FAIL  $1 (missing '$3')" ;; esac
}

sh_in() { # run a shell snippet in the image with the bucket/site volumes mounted
  docker run --rm ${platform_args[@]+"${platform_args[@]}"} -u 0 -v "$BUCKET:/bucket" -v "$SITE:/srv/site" -v "$TMPV:/tmp" --entrypoint sh "$IMAGE" -c "$1"
}
sync_once() { # content-sync once, local bucket
  docker run --rm ${platform_args[@]+"${platform_args[@]}"} -u 101:101 --read-only --cap-drop ALL --security-opt no-new-privileges \
    -v "$BUCKET:/bucket" -v "$SITE:/srv/site" -v "$TMPV:/tmp" -e REMOTE=/bucket -e SITE_ROOT=/srv/site \
    --entrypoint content-sync "$IMAGE" once 2>&1
}
make_release() { # id, optional "badversion" | "noindex"
  docker run --rm ${platform_args[@]+"${platform_args[@]}"} -u 0 -v "$BUCKET:/bucket" -v "$HERE/make-release.sh:/make-release.sh:ro" \
    --entrypoint sh "$IMAGE" /make-release.sh "$@"
}
set_latest() { sh_in "printf '%s\n' '$1' > /bucket/LATEST"; }
current() { sh_in 'readlink /srv/site/current 2>/dev/null || echo none'; }
http() { # container, path -> full raw response (status line, headers, body)
  docker run --rm --network "container:$1" --entrypoint sh "$IMAGE" -c \
    "printf 'GET $2 HTTP/1.0\\r\\nHost: smkabir.com\\r\\nConnection: close\\r\\n\\r\\n' | nc -w 3 127.0.0.1 8080" 2>/dev/null | tr -d '\r'
}
status() { http "$1" "$2" | head -1 | cut -d' ' -f2; }
header() { http "$1" "$2" | grep -i -m1 "^$3:" | sed 's/^[^:]*: *//'; }

echo "== build ($IMAGE ${PLATFORM:-host platform})"
docker build ${platform_args[@]+"${platform_args[@]}"} -q -t "$IMAGE" . >/dev/null || { echo "  FAIL  docker build"; exit 1; }
echo "  PASS  docker build"
docker volume create "$BUCKET" >/dev/null; docker volume create "$SITE" >/dev/null; docker volume create "$TMPV" >/dev/null

echo "== image contents"
ok "runs as uid 101"              test "$(docker run --rm ${platform_args[@]+"${platform_args[@]}"} --entrypoint id "$IMAGE" -u)" = 101
ok "nginx config is valid"       docker run --rm ${platform_args[@]+"${platform_args[@]}"} -v "$SITE:/srv/site" --entrypoint sh "$IMAGE" -c 'touch /srv/site/_redirects.conf; nginx -t'
ok "default welcome site removed" docker run --rm ${platform_args[@]+"${platform_args[@]}"} --entrypoint sh "$IMAGE" -c '! test -e /etc/nginx/conf.d/default.conf'
ok "no site content baked in"    docker run --rm ${platform_args[@]+"${platform_args[@]}"} --entrypoint sh "$IMAGE" -c '! ls /srv/site/*.html'

echo "== content-sync"
out=$(sync_once)
eq "empty bucket: no release, no crash" none "$(current)"
make_release rel1
set_latest ../../etc
sync_once >/dev/null
eq "path-traversal id is ignored" none "$(current)"
set_latest rel1
out=$(sync_once)
eq "valid release becomes current" rel1 "$(current)"
contains "serves the release" "$(sh_in 'cat /srv/site/current/index.html')" "home rel1"
eq "redirect list is not published" no "$(sh_in 'test -e /srv/site/rel1/_redirects.json && echo yes || echo no')"
conf=$(sh_in 'cat /srv/site/_redirects.conf')
contains "good redirect rendered" "$conf" '"/old/" "/about/";'
contains "https redirect rendered" "$conf" '"/ext/" "https://example.org/p";'
eq "injection attempt dropped" 0 "$(printf '%s' "$conf" | grep -c 'pwn')"
eq "protocol-relative redirect dropped" 0 "$(printf '%s' "$conf" | grep -c 'evil.example')"

make_release rel2 badversion; set_latest rel2
sync_once >/dev/null
eq "mismatched version.json is rejected" rel1 "$(current)"
eq "rejected release leaves no leftovers" 0 "$(sh_in 'ls -A /srv/site | grep -c incoming')"
make_release rel2b noindex; set_latest rel2b
sync_once >/dev/null
eq "release without index.html is rejected" rel1 "$(current)"
set_latest does-not-exist
sync_once >/dev/null
eq "missing release is rejected" rel1 "$(current)"

make_release rel3; set_latest rel3
sync_once >/dev/null
eq "next release swaps in" rel3 "$(current)"
ok "previous release kept for quick rollback" sh_in 'test -d /srv/site/rel1'
make_release rel4; set_latest rel4
sync_once >/dev/null
eq "fourth release swaps in" rel4 "$(current)"
eq "older releases pruned" no "$(sh_in 'test -d /srv/site/rel1 && echo yes || echo no')"
set_latest rel3
sync_once >/dev/null
eq "rollback by pointer works" rel3 "$(current)"

echo "== nginx (non-root, read-only root fs, all capabilities dropped)"
# fresh content volume state: current -> rel3 from above
NGINX="ss-nginx-$RUN_ID"
docker run -d --name "$NGINX" ${platform_args[@]+"${platform_args[@]}"} -u 101:101 --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v "$SITE:/srv/site:ro" -v "$TMPV:/tmp" "$IMAGE" >/dev/null
sleep 2
eq "container is running" true "$(docker inspect -f '{{.State.Running}}' "$NGINX")"
eq "/healthz 200" 200 "$(status "$NGINX" /healthz)"
eq "/version.json 200" 200 "$(status "$NGINX" /version.json)"
contains "/version.json reports the live release" "$(http "$NGINX" /version.json)" '"build_id":"rel3"'
eq "/version.json is no-store" "no-store" "$(header "$NGINX" /version.json Cache-Control)"
eq "home 200" 200 "$(status "$NGINX" /)"
eq "directory without slash redirects (301)" 301 "$(status "$NGINX" /about)"
eq "...with a relative Location (no :8080 leak)" "/about/" "$(header "$NGINX" /about Location)"
eq "missing page 404" 404 "$(status "$NGINX" /nope/)"
contains "custom 404 page is served" "$(http "$NGINX" /nope/)" "not found"
eq "html cache policy" "public, max-age=0, s-maxage=86400" "$(header "$NGINX" /about/ Cache-Control)"
eq "hashed assets are immutable" "public, max-age=31536000, immutable" "$(header "$NGINX" /_astro/app.abc123.css Cache-Control)"
eq "images cache an hour in browsers" "public, max-age=3600, s-maxage=86400" "$(header "$NGINX" /images/a.webp Cache-Control)"
contains "CSP header present" "$(header "$NGINX" /about/ Content-Security-Policy)" "default-src 'self'"
contains "CSP present on the 404 page too" "$(header "$NGINX" /nope/ Content-Security-Policy)" "default-src 'self'"
eq "nosniff" nosniff "$(header "$NGINX" /about/ X-Content-Type-Options)"
eq "Permissions-Policy" "camera=(), microphone=(), geolocation=()" "$(header "$NGINX" /about/ Permissions-Policy)"
eq "server version hidden" nginx "$(header "$NGINX" / Server)"
trav=$(status "$NGINX" /../../etc/passwd)
case "$trav" in 400 | 404) eq "path traversal does not escape the site root" ok ok ;; *) eq "path traversal does not escape the site root" "400 or 404" "$trav" ;; esac
eq "redirects not active before nginx reload" 200 "$(status "$NGINX" /about/)"

echo "== pod simulation (sidecar + nginx, shared PID namespace and /tmp)"
SYNC="ss-sync-$RUN_ID"
docker rm -f "$NGINX" >/dev/null
docker run -d --name "$NGINX" ${platform_args[@]+"${platform_args[@]}"} -u 101:101 --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v "$SITE:/srv/site:ro" -v "$TMPV:/tmp" "$IMAGE" >/dev/null
docker run -d --name "$SYNC" ${platform_args[@]+"${platform_args[@]}"} --pid "container:$NGINX" -u 101:101 --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v "$BUCKET:/bucket" -v "$SITE:/srv/site" -v "$TMPV:/tmp" -e REMOTE=/bucket -e POLL_SECONDS=1 --entrypoint content-sync "$IMAGE" >/dev/null
sleep 2
eq "before: /moved/ is not a redirect" 404 "$(status "$NGINX" /moved/)"
make_release rel5 extra; set_latest rel5
sleep 5
eq "sidecar picked up the new release" '"build_id":"rel5"' "$(http "$NGINX" /version.json | grep -o '"build_id":"[^"]*"' | head -1)"
eq "after reload: /moved/ redirects (301)" 301 "$(status "$NGINX" /moved/)"
eq "...to /about/" "/about/" "$(header "$NGINX" /moved/ Location)"
contains "sidecar logged the reload" "$(docker logs "$SYNC" 2>&1)" "nginx reloaded"
set_latest nonsense/../x
sleep 3
eq "bad pointer: still serving rel5" '"build_id":"rel5"' "$(http "$NGINX" /version.json | grep -o '"build_id":"[^"]*"' | head -1)"
ok "sidecar survived the bad pointer" test "$(docker inspect -f '{{.State.Running}}' "$SYNC")" = true

echo
echo "image tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
