#!/bin/sh
# Installs the two CLI tools CI needs, pinned by version AND SHA-256 (a changed upstream file fails the job):
#   d2      renders diagram blocks at build time (a missing binary fails the build when CI is set)
#   rclone  talks S3 to R2
# Linux amd64 only (GitHub's ubuntu runners). Bump version and hash together, and note it in docs/versions.md.
#   install-tools.sh [d2] [rclone]      default: both. Installs into $INSTALL_DIR (default ~/.local/bin).
set -eu

D2_VERSION=0.9.0
D2_SHA256=5669ddc46b99e942cc96078f4a4e36d5e62103348f4c05179ede27802fdd87a9
RCLONE_VERSION=1.74.1
RCLONE_SHA256=67df3059a6233b6e32e604bcd637654bb294ff86291b65ede77123e94818d911

DEST="${INSTALL_DIR:-$HOME/.local/bin}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$DEST"

fetch() { # url sha256 file
  curl -fsSL --retry 3 -o "$WORK/$3" "$1"
  echo "$2  $WORK/$3" | sha256sum -c - >/dev/null || { echo "install-tools: checksum mismatch for $1" >&2; exit 1; }
}

install_d2() {
  fetch "https://github.com/terrastruct/d2/releases/download/v${D2_VERSION}/d2-v${D2_VERSION}-linux-amd64.tar.gz" "$D2_SHA256" d2.tgz
  tar -xzf "$WORK/d2.tgz" -C "$WORK" "d2-v${D2_VERSION}/bin/d2"
  install -m 0755 "$WORK/d2-v${D2_VERSION}/bin/d2" "$DEST/d2"
  echo "install-tools: d2 $("$DEST/d2" --version)"
}

install_rclone() {
  fetch "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.zip" "$RCLONE_SHA256" rclone.zip
  unzip -q -o -j "$WORK/rclone.zip" "rclone-v${RCLONE_VERSION}-linux-amd64/rclone" -d "$WORK"
  install -m 0755 "$WORK/rclone" "$DEST/rclone"
  echo "install-tools: $("$DEST/rclone" version | head -1)"
}

[ "$#" -gt 0 ] || set -- d2 rclone
for tool in "$@"; do
  case "$tool" in
    d2) install_d2 ;;
    rclone) install_rclone ;;
    *) echo "install-tools: unknown tool $tool" >&2; exit 2 ;;
  esac
done
