#!/bin/sh
# Tests release.sh against a fake bucket (rclone's local backend). Runs inside the server image, which has
# rclone, jq and busybox:   docker run --rm -v "$PWD/scripts/ci:/ci:ro" --entrypoint sh <image> /ci/test-release.sh
set -u
export BUCKET=/tmp/bucket
R="sh /ci/release.sh"
pass=0; fail=0
t() { # name, expected exit (0|nonzero), command...
  name=$1 want=$2; shift 2
  out=$("$@" 2>&1); rc=$?
  if { [ "$want" = 0 ] && [ $rc -eq 0 ]; } || { [ "$want" = nonzero ] && [ $rc -ne 0 ]; }; then pass=$((pass + 1)); echo "  PASS  $name"
  else fail=$((fail + 1)); echo "  FAIL  $name (exit $rc): $out"; fi
}
is() { if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "  PASS  $1"; else fail=$((fail + 1)); echo "  FAIL  $1 (expected '$2', got '$3')"; fi; }

mkdist() { # id [no-index|bad-version]
  d=/tmp/dist-$1; rm -rf "$d"; mkdir -p "$d/about"
  echo "<h1>$1</h1>" >"$d/index.html"; echo about >"$d/about/index.html"
  echo "{\"build_id\":\"$1\"}" >"$d/version.json"
  [ "${2:-}" = no-index ] && rm "$d/index.html"
  [ "${2:-}" = bad-version ] && echo '{"build_id":"other"}' >"$d/version.json"
}
ptr() { cat "$BUCKET/$1" 2>/dev/null | tr -d '[:space:]'; }
have() { test -d "$BUCKET/releases/$1" && echo yes || echo no; }

rm -rf "$BUCKET" /tmp/dist-*; mkdir -p "$BUCKET"

echo "== upload"
mkdist a1111111-100 no-index;     t "refuses a build with no index.html" nonzero $R upload /tmp/dist-a1111111-100 a1111111-100
mkdist a1111111-100 bad-version;  t "refuses a version.json that disagrees" nonzero $R upload /tmp/dist-a1111111-100 a1111111-100
mkdist a1111111-100
t "rejects a path-traversal id" nonzero $R upload /tmp/dist-a1111111-100 ../evil
t "uploads a good build" 0 $R upload /tmp/dist-a1111111-100 a1111111-100
is "upload alone does not move LATEST" "" "$(ptr LATEST)"
t "a retry with identical content is a no-op (re-run safe)" 0 $R upload /tmp/dist-a1111111-100 a1111111-100
echo changed >/tmp/dist-a1111111-100/about/index.html
t "different content under an existing id is refused (immutable)" nonzero $R upload /tmp/dist-a1111111-100 a1111111-100
echo about >/tmp/dist-a1111111-100/about/index.html
echo extra >/tmp/dist-a1111111-100/extra.html
t "an extra file under an existing id is refused too" nonzero $R upload /tmp/dist-a1111111-100 a1111111-100
rm /tmp/dist-a1111111-100/extra.html

echo "== preflight (clear errors instead of exit 1)"
t "check passes on a readable bucket" 0 $R check
out=$(BUCKET=/tmp/no-such-bucket sh /ci/release.sh upload /tmp/dist-a1111111-100 a1111111-100 2>&1); rc=$?
is "an unreadable bucket stops the upload" nonzero "$([ $rc -ne 0 ] && echo nonzero || echo zero)"
case "$out" in *"cannot read the bucket"*"R2_ACCOUNT_ID"*) pass=$((pass + 1)); echo "  PASS  ...and says why, and what to check" ;; *) fail=$((fail + 1)); echo "  FAIL  ...and says why (got: $out)" ;; esac
case "$(BUCKET=/tmp/no-such-bucket sh /ci/release.sh point LATEST a1111111-100 2>&1)" in *"cannot read the bucket"*) pass=$((pass + 1)); echo "  PASS  a pointer move is guarded the same way" ;; *) fail=$((fail + 1)); echo "  FAIL  a pointer move is not guarded" ;; esac

echo "== pointers"
t "will not point at a missing release" nonzero $R point LATEST nope-1
t "will not accept an unknown pointer name" nonzero $R point CURRENT a1111111-100
t "points LATEST" 0 $R point LATEST a1111111-100
is "LATEST reads back" a1111111-100 "$(ptr LATEST)"

echo "== prune (never removes what a pointer references)"
for n in 200 300 400 500 600; do mkdist b$n-$n; $R upload /tmp/dist-b$n-$n b$n-$n >/dev/null; done
$R point LATEST b300-300 >/dev/null     # an OLD release is live
$R point VERIFIED b600-600 >/dev/null
t "refuses to keep fewer than 2" nonzero $R prune 1
t "prunes to 3" 0 $R prune 3
is "pointed-at old release survives" yes "$(have b300-300)"
is "verified release survives" yes "$(have b600-600)"
is "oldest unreferenced release is gone" no "$(have a1111111-100)"
is "second oldest unreferenced is gone" no "$(have b200-200)"
is "newer unreferenced release kept" yes "$(have b500-500)"

echo "== rollback"
t "rollback to an existing release" 0 $R rollback b500-500
is "LATEST moved" b500-500 "$(ptr LATEST)"
is "VERIFIED moved" b500-500 "$(ptr VERIFIED)"
t "rollback to a pruned release fails" nonzero $R rollback a1111111-100
is "failed rollback left LATEST alone" b500-500 "$(ptr LATEST)"

echo "== verify-live"
# a one-line origin: answers every request with the version document
( while :; do printf 'HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n{"build_id":"b500-500"}' | nc -l -p 8099 >/dev/null 2>&1; done ) &
ORIGIN=$!
sleep 1
t "succeeds when the origin reports the id" 0 $R verify-live http://127.0.0.1:8099/version.json b500-500 20
t "times out when it never does" nonzero $R verify-live http://127.0.0.1:8099/version.json other-1 10
kill $ORIGIN 2>/dev/null

echo
echo "release.sh tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
