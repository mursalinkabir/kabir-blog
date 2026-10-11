#!/usr/bin/env bash
# End to end with the real site: dist -> release.sh upload/point -> content-sync -> nginx (restricted container).
# Then every URL in the sitemap must answer 200 through nginx. Needs Docker and a built apps/site/dist.
#
#   BUILD_ID=<id> pnpm build            # so dist/version.json carries a valid id
#   apps/server/tests/e2e.sh [dist-dir] [host-port]     # leaves nginx running on host-port if KEEP=1
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
DIST="${1:-$ROOT/apps/site/dist}"; PORT="${2:-8081}"
IMAGE="${IMAGE:-kabir-blog-server:test}"
ID=$(jq -er .build_id "$DIST/version.json") || { echo "dist/version.json has no build_id; build with BUILD_ID set"; exit 1; }
RUN="e2e$$"; B="b-$RUN"; S="s-$RUN"; T="t-$RUN"; N="n-$RUN"
cleanup() { [ "${KEEP:-0}" = 1 ] || { docker rm -f "$N" >/dev/null 2>&1; docker volume rm -f "$B" "$S" "$T" >/dev/null 2>&1; }; }
trap cleanup EXIT
fail=0; say() { echo "  $*"; }
docker volume create "$B" >/dev/null; docker volume create "$S" >/dev/null; docker volume create "$T" >/dev/null

echo "== publish $ID (release.sh against a local bucket)"
docker run --rm -u 0 -e BUCKET=/bucket -v "$B:/bucket" -v "$DIST:/dist:ro" -v "$ROOT/scripts/ci:/ci:ro" --entrypoint sh "$IMAGE" -c \
  "sh /ci/release.sh upload /dist '$ID' && sh /ci/release.sh point LATEST '$ID'" 2>&1 | sed 's/^/  /'
[ "${PIPESTATUS[0]}" = 0 ] || { echo "  FAIL publish"; exit 1; }

echo "== sync + serve (restricted container)"
docker run --rm -u 101:101 --read-only --cap-drop ALL --security-opt no-new-privileges -v "$B:/bucket" -v "$S:/srv/site" -v "$T:/tmp" \
  -e REMOTE=/bucket --entrypoint content-sync "$IMAGE" once 2>&1 | sed 's/^/  /'
docker run -d --name "$N" -p "$PORT:8080" -u 101:101 --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v "$S:/srv/site:ro" -v "$T:/tmp" "$IMAGE" >/dev/null
sleep 2

echo "== every sitemap URL answers 200 through nginx"
urls=$(cat "$DIST"/sitemap-*.xml | grep -o '<loc>[^<]*</loc>' | sed 's|<loc>https://smkabir.com||; s|</loc>||' | sort -u)
list=$(printf '%s\n' "$urls" /404.html /robots.txt /version.json /healthz /rss.xml /ja/rss.xml /pagefind/pagefind.js | grep -v '^/404.html$' )
bad=$(docker run --rm --network "container:$N" --entrypoint sh "$IMAGE" -c '
  for p in '"$(printf '%s ' $list)"'; do
    code=$(wget -q -S -O /dev/null "http://127.0.0.1:8080$p" 2>&1 | grep -m1 "HTTP/" | cut -d" " -f4)
    [ "$code" = 200 ] || echo "$p -> ${code:-no response}"
  done')
n=$(printf '%s\n' $list | grep -c .)
if [ -z "$bad" ]; then say "PASS  $n URLs, all 200"; else say "FAIL"; echo "$bad" | sed 's/^/    /'; fail=1; fi
code404=$(docker run --rm --network "container:$N" --entrypoint sh "$IMAGE" -c 'wget -q -S -O /dev/null http://127.0.0.1:8080/does-not-exist/ 2>&1 | grep -m1 HTTP/ | cut -d" " -f4')
[ "$code404" = 404 ] && say "PASS  unknown URL -> 404" || { say "FAIL  unknown URL -> $code404"; fail=1; }
[ "$fail" = 0 ] && echo "e2e: OK (nginx on http://localhost:$PORT while KEEP=1)" || echo "e2e: FAILED"
[ "$fail" = 0 ]
