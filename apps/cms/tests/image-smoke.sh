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

echo "== Process"
check "runs as uid 10001" 10001 "$(docker exec "$name" id -u)"

exit "$fail"
