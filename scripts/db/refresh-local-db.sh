#!/usr/bin/env bash
#
# Copy an environment's database into a local SQL Server container, end to end,
# and point the local CMS at it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

LOCAL_SETTINGS="$KINORGE_REPO_ROOT/apps/cms-umbraco/appsettings.Local.json"
MARKER='"_generatedBy": "scripts/db/refresh-local-db.sh"'

usage() {
  cat >&2 <<EOF
usage: refresh-local-db.sh <env> [--skip-export] [--keep-container] [--port N]
       refresh-local-db.sh --off

  <env>              one of: $(list_environments)
  --skip-export      reuse the newest existing .bacpac for this environment
  --keep-container   import into the running container instead of recreating it
  --port N           host port for the container (default: 1433, or the next
                     free port if 1433 is taken)
  --off              point the local CMS back at SQLite (removes the generated
                     appsettings.Local.json; the container is left alone)
EOF
  exit 1
}

ENV_NAME=""
SKIP_EXPORT=0
KEEP_CONTAINER=0
PORT_ARGS=""
TURN_OFF=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-export)    SKIP_EXPORT=1; shift ;;
    --keep-container) KEEP_CONTAINER=1; shift ;;
    --port)           [ $# -ge 2 ] || usage; PORT_ARGS="--port $2"; shift 2 ;;
    --off)            TURN_OFF=1; shift ;;
    -h|--help) usage ;;
    -*) log "unknown option: $1"; usage ;;
    *)  [ -z "$ENV_NAME" ] || usage; ENV_NAME="$1"; shift ;;
  esac
done

if [ "$TURN_OFF" -eq 1 ]; then
  if [ ! -f "$LOCAL_SETTINGS" ]; then
    log "no appsettings.Local.json, the local CMS already uses SQLite"
  elif grep -qF "$MARKER" "$LOCAL_SETTINGS"; then
    rm -f "$LOCAL_SETTINGS"
    log "removed appsettings.Local.json, the local CMS uses SQLite again"
  else
    die "$LOCAL_SETTINGS was not written by this script; edit it by hand"
  fi
  exit 0
fi

[ -n "$ENV_NAME" ] || usage
resolve_environment "$ENV_NAME" >/dev/null

# Refuse early, before a long export, if we would not be allowed to write the
# settings file at the end.
if [ -f "$LOCAL_SETTINGS" ] && ! grep -qF "$MARKER" "$LOCAL_SETTINGS"; then
  die "$LOCAL_SETTINGS exists and was not written by this script.
Move it aside and re-run, so your own overrides are not overwritten."
fi

BACPAC_DIR="$KINORGE_REPO_ROOT/.bacpacs"

if [ "$SKIP_EXPORT" -eq 1 ]; then
  # Filenames are ENV-umbraco-TIMESTAMP.bacpac from export-bacpac.sh.
  # shellcheck disable=SC2012
  BACPAC="$(ls -t "$BACPAC_DIR/$ENV_NAME-umbraco-"*.bacpac 2>/dev/null | head -1 || true)"
  [ -n "$BACPAC" ] || die "no existing .bacpac for '$ENV_NAME' in $BACPAC_DIR"
  log "==> reusing $(basename "$BACPAC")"
else
  log "==> step 1/4: exporting from $ENV_NAME"
  BACPAC="$("$SCRIPT_DIR/export-bacpac.sh" "$ENV_NAME" | tail -1)"
fi

log "==> step 2/4: starting the local container"
KEEP_ARG=""
[ "$KEEP_CONTAINER" -eq 1 ] && KEEP_ARG="--keep"
# shellcheck disable=SC2086
"$SCRIPT_DIR/start-sqlserver.sh" $KEEP_ARG $PORT_ARGS >/dev/null

log "==> step 3/4: importing"
# shellcheck disable=SC2086
"$SCRIPT_DIR/import-bacpac.sh" "$BACPAC" $PORT_ARGS

log "==> step 4/4: local admin login"
"$SCRIPT_DIR/set-local-admin.sh"

# shellcheck source=/dev/null
. "$SCRIPT_DIR/.env"

DSN="Server=127.0.0.1,${MSSQL_PORT};Database=umbraco;User Id=sa;Password=${MSSQL_SA_PASSWORD};TrustServerCertificate=True;Encrypt=False;MultipleActiveResultSets=True"

# appsettings.Local.json is git-ignored and only loaded in Development (Program.cs),
# so the tracked appsettings.Development.json stays as it is on main.
umask 077
cat >"$LOCAL_SETTINGS" <<EOF
{
  $MARKER,
  "_warning": "Local copy of the $ENV_NAME database. Contains a local password. Git-ignored, never commit. Remove with scripts/db/refresh-local-db.sh --off",
  "ConnectionStrings": {
    "umbracoDbDSN": "$DSN",
    "umbracoDbDSN_ProviderName": "Microsoft.Data.SqlClient"
  },
  "Umbraco": {
    "CMS": {
      "Unattended": {
        "UpgradeUnattended": true
      }
    }
  }
}
EOF
chmod 600 "$LOCAL_SETTINGS"

cat <<EOF

Done. The local CMS now uses a copy of the $ENV_NAME database.

Start it with:

  pnpm run cms:dev:db-copy

and log in at https://localhost:44391/umbraco with the local admin from
CLAUDE.md (admin@ki.norge.no). Entra ID login is not available locally.

Images do not load: media lives in Azure Blob, not in the database.
Back to SQLite:  scripts/db/refresh-local-db.sh --off
EOF
