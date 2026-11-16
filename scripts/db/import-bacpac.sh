#!/usr/bin/env bash
#
# Import a .bacpac into the local container.
#
# Writes ONLY to localhost. assert_local_target makes that structural: a
# mistyped host exits rather than reaching Azure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

ENV_FILE="$SCRIPT_DIR/.env"

usage() {
  cat >&2 <<EOF
usage: import-bacpac.sh <file.bacpac> [--db NAME] [--port N]

  --db NAME   target database name (default: umbraco)
  --port N    host port of the container (default: MSSQL_PORT from .env, else 1433)
EOF
  exit 1
}

BACPAC=""
DB_NAME="umbraco"
PORT_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --db)   [ $# -ge 2 ] || usage; DB_NAME="$2"; shift 2 ;;
    --port) [ $# -ge 2 ] || usage; PORT_OVERRIDE="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) log "unknown option: $1"; usage ;;
    *)  [ -z "$BACPAC" ] || usage; BACPAC="$1"; shift ;;
  esac
done

case "$DB_NAME" in
  ''|*[!A-Za-z0-9_]*) die "invalid --db value '$DB_NAME': letters, digits and underscore only" ;;
esac

[ -n "$BACPAC" ] || usage
[ -f "$BACPAC" ] || die "no such file: $BACPAC"

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Run start-sqlserver.sh first."
# shellcheck source=/dev/null
. "$ENV_FILE"

PORT="${PORT_OVERRIDE:-${MSSQL_PORT:-1433}}"
HOST="127.0.0.1"

# Validate the port before it goes into a connection string. The .NET parser
# uses the LAST occurrence of a duplicate key, so a port containing `;` could
# inject a `Server=` that redirects this write to a remote host.
case "$PORT" in
  ''|*[!0-9]*) die "invalid port '$PORT': must be a number" ;;
esac

# The guard. Do not remove, and do not turn into a prompt.
assert_local_target "$HOST"

require_sqlpackage
require_sqlcmd
SQLPACKAGE="$(find_sqlpackage)"

SA_PASSWORD="${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD missing from $ENV_FILE}"
CONN="Server=$HOST,$PORT;Initial Catalog=$DB_NAME;User ID=sa;Password=$SA_PASSWORD;Encrypt=True;TrustServerCertificate=True"

log "dropping existing database '$DB_NAME' if present ..."
run_sqlcmd -S "$HOST,$PORT" -U sa -P "$SA_PASSWORD" -C \
  -Q "DROP DATABASE IF EXISTS [$DB_NAME];" >/dev/null

log "importing $(basename "$BACPAC") into '$DB_NAME' ..."
START="$(date +%s)"
"$SQLPACKAGE" /Action:Import \
  /SourceFile:"$BACPAC" \
  /TargetConnectionString:"$CONN" \
  >&2 || die "import failed.

If it failed on a foreign-key constraint, the export caught the source database
mid-write. A bacpac export is not transactionally consistent. Re-export."
log "imported in $(( $(date +%s) - START ))s"

log "verifying content ..."
ROWS="$(run_sqlcmd -S "$HOST,$PORT" -U sa -P "$SA_PASSWORD" -C -d "$DB_NAME" \
  -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM umbracoNode;" | tr -d '[:space:]')"
[ "$ROWS" -gt 0 ] 2>/dev/null || die "umbracoNode is empty, the import did not land data"
log "umbracoNode rows: $ROWS"

log "checking constraint consistency ..."
CHECK_RESULT="$(run_sqlcmd -S "$HOST,$PORT" -U sa -P "$SA_PASSWORD" -C -d "$DB_NAME" \
  -h -1 -W -Q "SET NOCOUNT ON;
BEGIN TRY
  CREATE TABLE #cc (TableName sysname, ConstraintName sysname, WhereClause nvarchar(max));
  INSERT INTO #cc EXEC('DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS');
  SELECT 'CHECKOK ' + CAST(COUNT(*) AS varchar(20)) FROM #cc;
END TRY
BEGIN CATCH
  SELECT 'CHECKFAILED ' + ERROR_MESSAGE();
END CATCH" 2>&1 | grep -E '^CHECK(OK|FAILED)' | tail -1 || true)"
# `|| true` is load-bearing: grep exits 1 on no match, and under pipefail that
# would abort here instead of reaching the explanation below.

case "$CHECK_RESULT" in
  'CHECKOK '*) VIOLATIONS="${CHECK_RESULT#CHECKOK }" ;;
  'CHECKFAILED '*) die "constraint check failed to run: ${CHECK_RESULT#CHECKFAILED }" ;;
  *) die "the constraint check produced no usable result. The import itself
succeeded; re-run the check by hand against '$DB_NAME' on 127.0.0.1,$PORT." ;;
esac

case "$VIOLATIONS" in
  ''|*[!0-9]*) die "constraint check did not return a count (got: '$VIOLATIONS')" ;;
esac

if [ "$VIOLATIONS" -eq 0 ]; then
  log "no constraint violations"
else
  log "WARNING: $VIOLATIONS constraint violation(s) found. The export caught the"
  log "source mid-write. The copy is usable but may be inconsistent; re-export"
  log "for a clean one."
fi
