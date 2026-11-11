#!/usr/bin/env bash
# Smoke test for the CMS image under the restrictions the cluster applies (PodSecurity "restricted"):
# non-root, read-only root filesystem, all capabilities dropped, no privilege escalation.
#   bash apps/cms/tests/image-smoke.sh [image]        (default image: kabir-blog-cms:test)
# What it proves: the server starts, /healthz answers without Access, and every other path is refused
# when Access is not configured (503) or when no assertion is presented (401). The database is not needed.
set -euo pipefail

image="${1:-kabir-blog-cms:test}"
port="${SMOKE_PORT:-3199}"
name="cms-smoke-$$"
fail=0

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

run() {
  # $@ = extra env flags
  cleanup
  docker run -d --name "$name" -p "127.0.0.1:${port}:3100" \
    --user 10001:10001 --read-only --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /tmp --tmpfs /app/apps/cms/.next/cache:uid=10001 --tmpfs /app/apps/cms/media:uid=10001 \
    -e PAYLOAD_SECRET=smoke-test-secret-not-used-anywhere \
    -e DATABASE_URL=postgres://smoke:smoke@127.0.0.1:1/smoke \
    "$@" "$image" >/dev/null
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null "http://127.0.0.1:${port}/healthz" 2>/dev/null && return 0
    sleep 1
  done
  echo "FAIL: container did not become healthy"; docker logs "$name" | tail -20; return 1
}

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

check() { # description expected actual
  if [ "$2" = "$3" ]; then echo "ok   $1 ($3)"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi
}

echo "== Access not configured (fails closed)"
run
check "/healthz answers"                    200 "$(code "http://127.0.0.1:${port}/healthz")"
check "/readyz is not behind Access, and says not ready without a database" 503 "$(code "http://127.0.0.1:${port}/readyz")"
check "/admin refused"                      503 "$(code "http://127.0.0.1:${port}/admin")"
check "/api/mcp refused"                    503 "$(code "http://127.0.0.1:${port}/api/mcp")"
check "assertion cannot help when unconfigured" 503 "$(code -H 'Cf-Access-Jwt-Assertion: a.b.c' "http://127.0.0.1:${port}/admin")"

echo "== Access configured, no / bad assertion"
run -e CF_ACCESS_TEAM_DOMAIN=smoke-team.cloudflareaccess.com -e CF_ACCESS_AUD=smoke-aud
check "/healthz answers"                    200 "$(code "http://127.0.0.1:${port}/healthz")"
check "/admin without assertion"            401 "$(code "http://127.0.0.1:${port}/admin")"
check "/api/users/me without assertion"     401 "$(code "http://127.0.0.1:${port}/api/users/me")"
check "garbage assertion"                   403 "$(code -H 'Cf-Access-Jwt-Assertion: not-a-jwt' "http://127.0.0.1:${port}/admin")"

echo "== Public hostname: pages only, no Access (SITE_PUBLIC_HOSTS), no database in this test"
run -e CF_ACCESS_TEAM_DOMAIN=smoke-team.cloudflareaccess.com -e CF_ACCESS_AUD=smoke-aud -e SITE_PUBLIC_HOSTS=smkabir.com
pub() { code -H 'Host: smkabir.com' "http://127.0.0.1:${port}$1"; }
check "public: stylesheet served without Access"  200 "$(pub /site/site.css)"
check "public: script served"                     200 "$(pub /site/site.js)"
check "public: font served"                       200 "$(pub /site/fonts/mulish-latin-wght-normal.woff2)"
check "public: favicon served"                    200 "$(pub /favicon.svg)"
check "public: theme-init served"                 200 "$(pub /theme-init.js)"
check "public: old image URL still works"         200 "$(pub /images/covers/cover-finance-1600.webp)"
check "public: robots.txt"                        200 "$(pub /robots.txt)"
check "public: /admin is hidden"                  404 "$(pub /admin)"
check "public: /admin/ is hidden"                 404 "$(pub /admin/login)"
check "public: /api is hidden"                    404 "$(pub /api/posts)"
check "public: MCP is hidden"                     404 "$(pub /api/mcp)"
check "public: /preview is hidden"                404 "$(pub /preview/posts/x/)"
check "public: host case and a dot do not matter" 404 "$(code -H 'Host: SMKABIR.COM.' "http://127.0.0.1:${port}/admin")"
check "public: page path without a slash redirects" 308 "$(pub /posts/x)"
check "cms host: / needs Access"                  401 "$(code -H 'Host: cms.smkabir.com' "http://127.0.0.1:${port}/")"
check "unknown host: / needs Access"              401 "$(code -H 'Host: other.example' "http://127.0.0.1:${port}/")"
echo "-- a page needs the database: without one the answer is an error, never an empty page"
check "public: home without a database"           500 "$(pub /)"

echo "== Tools inside the image (read-only root, uid 10001)"
check "d2 is installed" "v0.9.0" "$(docker exec "$name" d2 --version)"
svg="$(printf 'a -> b' | docker exec -i "$name" d2 - - 2>/dev/null | head -c 5)"
check "d2 renders a diagram under the restrictions" "<?xml" "$svg"
hl="$(docker exec -w /app/apps/cms "$name" node -e "import('rehype-expressive-code').then(async (m) => { const r = await m.createRenderer({ themes: ['github-light'] }); const o = await r.ec.render({ code: 'let a = 1', language: 'js' }); console.log(o.renderedGroupAst ? 'ok' : 'no') })" 2>&1 | tail -1)"
check "the code highlighter loads and renders" "ok" "$hl"

echo "== Process"
check "runs as uid 10001" 10001 "$(docker exec "$name" id -u)"

exit "$fail"
