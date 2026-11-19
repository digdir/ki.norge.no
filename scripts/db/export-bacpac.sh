#!/usr/bin/env bash
#
# Export an environment's Umbraco database to a local .bacpac file.
#
# READ-ONLY against the environment. The remote operations are a `kubectl get`
# of the deployment (to find the host), a TCP reachability check and
# sqlpackage /Action:Export.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

usage() {
  cat >&2 <<EOF
usage: export-bacpac.sh <env> [--out DIR]

  <env>      environment name; one of: $(list_environments)
  --out DIR  output directory (default: <repo>/.bacpacs)

Authenticates with an Entra access token from the Azure CLI (az login).
Set KINORGE_SQL_HOST to skip looking the host up with kubectl.
EOF
  exit 1
}

ENV_NAME=""
OUT_DIR="$KINORGE_REPO_ROOT/.bacpacs"

while [ $# -gt 0 ]; do
  case "$1" in
    --out)  [ $# -ge 2 ] || usage; OUT_DIR="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) log "unknown option: $1"; usage ;;
    *)  [ -z "$ENV_NAME" ] || usage; ENV_NAME="$1"; shift ;;
  esac
done

[ -n "$ENV_NAME" ] || usage

require_sqlpackage
SQLPACKAGE="$(find_sqlpackage)"

KUBE_CONTEXT="$(resolve_environment "$ENV_NAME")"

if [ "$ENV_NAME" = "prod" ]; then
  log ""
  log "You are about to export from PRODUCTION."
  log "The export is read-only, but it puts read load on a live server and"
  log "produces a file containing real personal data (editor accounts, form data)."
  printf 'Type the word prod to continue: ' >&2
  read -r CONFIRM
  [ "$CONFIRM" = "prod" ] || die "aborted"
fi

log "looking up the Azure SQL host for $ENV_NAME ..."
HOST="$(resolve_sql_host "$KUBE_CONTEXT")"
log "host: $HOST"

log "checking connectivity to $HOST:1433 ..."
require_remote_reachable "$HOST" 1433

DB_TOKEN="$(get_db_access_token)"
# TrustServerCertificate as in info.altinn.no: the server certificate is issued for
# the public name, so validation fails against the privatelink name.
CONN="Server=tcp:$HOST,1433;Initial Catalog=umbraco;Encrypt=True;TrustServerCertificate=True"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
TARGET="$OUT_DIR/$ENV_NAME-umbraco-$(date +%Y%m%d-%H%M%S).bacpac"

log "exporting $ENV_NAME (umbraco) -> $TARGET"
log "this reads the whole database and can take several minutes ..."

# An access token lasts about an hour. A very large export can outlive it; if
# that happens, re-run. sqlpackage cannot refresh it mid-flight.
umask 077
"$SQLPACKAGE" /Action:Export \
  /SourceConnectionString:"$CONN" \
  /AccessToken:"$DB_TOKEN" \
  /TargetFile:"$TARGET" \
  >&2 || die "export failed.

If it says \"Login failed for user '<token-identified principal>'\", your Entra
account authenticated but has no access to the database. See
docs/local-database-copy.md for who grants it."

[ -s "$TARGET" ] || die "export reported success but $TARGET is missing or empty"
log "exported $(du -h "$TARGET" | cut -f1)"
printf '%s\n' "$TARGET"
