#!/usr/bin/env bash
# Generates and seals the CMS's own credentials, once. Production-ready. Needs only kubeseal and the public
# certificate in homelab-terraform: it never contacts the cluster, and no secret value is printed or written in plain.
#
#   bash deploy/homelab-terraform/seal-cms-core.sh           # HOMELAB_DIR defaults to the checkout below
#
# Writes (and refuses to overwrite, because a second run would mint a new password that no longer matches the
# role in the database):
#   prod/data-platform/04-payload-role.sealed.yaml   role `payload` password, basic-auth, namespace platform
#   prod/apps/cms/app.sealed.yaml                    PAYLOAD_SECRET and DATABASE_URL, namespace cms
# The same generated password goes into both: the role is created by CNPG's managed.roles from the first, the CMS
# connects with the second. To rotate: delete both files, run again, commit both in one change.
set -euo pipefail

HOMELAB_DIR="${HOMELAB_DIR:-$HOME/Dev/terraform/homelab-terraform/homelab-terraform}"
CERT="$HOMELAB_DIR/prod/data-platform/pub-cert.pem"
ROLE_OUT="$HOMELAB_DIR/prod/data-platform/04-payload-role.sealed.yaml"
APP_OUT="$HOMELAB_DIR/prod/apps/cms/app.sealed.yaml"
# The CMS connects to the primary directly: the pooler is transaction-mode and Payload uses session features.
DB_HOST="pg-main-rw.platform.svc.cluster.local"

[ -f "$CERT" ] || { echo "seal-cms-core: $CERT not found (set HOMELAB_DIR)" >&2; exit 1; }
command -v kubeseal >/dev/null && command -v openssl >/dev/null || { echo "seal-cms-core: kubeseal and openssl are required" >&2; exit 1; }
for f in "$ROLE_OUT" "$APP_OUT"; do
  [ ! -e "$f" ] || { echo "seal-cms-core: $f exists; refusing to mint a second password" >&2; exit 1; }
done
mkdir -p "$(dirname "$APP_OUT")"

# Hex only, so the password is safe inside a URL without escaping.
db_password="$(openssl rand -hex 24)"
payload_secret="$(openssl rand -hex 32)"
trap 'unset db_password payload_secret' EXIT

seal() { kubeseal --cert "$CERT" --format yaml; }
# Waves: the role secret and the CMS secret exist before anything that reads them.
annotate() {
  awk -v c="$1" -v w="$2" 'BEGIN{d=0} {print} /^metadata:/ && !d {print "  annotations:\n    # " c "\n    argocd.argoproj.io/sync-wave: \x27" w "\x27"; d=1}'
}

role_tmp="$(mktemp)"; app_tmp="$(mktemp)"
trap 'rm -f "$role_tmp" "$app_tmp"; unset db_password payload_secret' EXIT

cat <<YAML | seal | annotate "Role password for CNPG spec.managed.roles (03-cnpg-cluster.yaml)." 0 >"$role_tmp"
apiVersion: v1
kind: Secret
metadata:
  name: payload-postgres-credentials
  namespace: platform
type: kubernetes.io/basic-auth
stringData:
  username: payload
  password: "$db_password"
YAML

cat <<YAML | seal | annotate "Created before the Deployment (wave 0)." -2 >"$app_tmp"
apiVersion: v1
kind: Secret
metadata:
  name: cms-app
  namespace: cms
type: Opaque
stringData:
  PAYLOAD_SECRET: "$payload_secret"
  DATABASE_URL: "postgres://payload:$db_password@$DB_HOST:5432/payload"
YAML

for f in "$role_tmp" "$app_tmp"; do
  grep -q '^  encryptedData:' "$f" || { echo "seal-cms-core: no encryptedData in output; not trusting it" >&2; exit 1; }
  if grep -qF -e "$db_password" -e "$payload_secret" "$f"; then echo "seal-cms-core: plain value in output" >&2; exit 1; fi
done
mv "$role_tmp" "$ROLE_OUT"; mv "$app_tmp" "$APP_OUT"
echo "seal-cms-core: wrote $ROLE_OUT"
echo "seal-cms-core: wrote $APP_OUT"
