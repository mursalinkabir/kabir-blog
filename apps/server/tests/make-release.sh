#!/bin/sh
# Builds a tiny fake release inside the fake bucket. Used by run.sh only.
#   make-release.sh <id> [badversion|noindex]
set -eu
id=$1
mode=${2:-ok}
d=/bucket/releases/$id
rm -rf "$d"
mkdir -p "$d/about" "$d/_astro" "$d/images" "$d/posts/hello"
echo "<!doctype html><title>home $id</title><h1>home $id</h1>" >"$d/index.html"
echo '<!doctype html><title>about</title>about' >"$d/about/index.html"
echo '<!doctype html><title>hello</title>hello' >"$d/posts/hello/index.html"
echo '<!doctype html><title>404</title>not found' >"$d/404.html"
echo 'body{}' >"$d/_astro/app.abc123.css"
printf 'webp' >"$d/images/a.webp"
# One good redirect, one that tries to break out of the nginx string, one protocol-relative, one https.
cat >"$d/_redirects.json" <<'JSON'
[
  {"from": "/old/", "to": "/about/"},
  {"from": "/x\"; return 200 \"pwn", "to": "/y/"},
  {"from": "/ok/", "to": "//evil.example/"},
  {"from": "/ext/", "to": "https://example.org/p"}
]
JSON
# A redirect that earlier releases do not have, to prove the reload picked up the new list.
if [ "$mode" = extra ]; then
  sed -i 's|^\[|[\n  {"from": "/moved/", "to": "/about/"},|' "$d/_redirects.json"
fi
case $mode in
  badversion) echo '{"build_id":"someone-else"}' >"$d/version.json" ;;
  noindex)    echo "{\"build_id\":\"$id\"}" >"$d/version.json"; rm "$d/index.html" ;;
  *)          echo "{\"build_id\":\"$id\",\"builtAt\":\"2026-10-11T00:00:00Z\"}" >"$d/version.json" ;;
esac
