#!/usr/bin/env bash
#
# Create or reset a password-login admin in the LOCAL database copy.
#
# Prod and tt02 editors log in with Entra ID, which is not configured locally,
# so a copied database has no user who can log in. This gives it one, using the
# same throwaway login as a fresh local SQLite install.
#
# Writes ONLY to localhost.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

ENV_FILE="$SCRIPT_DIR/.env"

# The same throwaway values as the unattended install in
# apps/cms-umbraco/appsettings.Development.json. Local only, not secrets.
LOGIN="admin@ki.norge.no"
PASSWORD="KiNorge2025!"
DB_NAME="umbraco"

usage() {
  cat >&2 <<EOF
usage: set-local-admin.sh [--login EMAIL] [--password PASSWORD]

  --login EMAIL        default: $LOGIN
  --password PASSWORD  default: the local throwaway password from CLAUDE.md
EOF
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --login)    [ $# -ge 2 ] || usage; LOGIN="$2"; shift 2 ;;
    --password) [ $# -ge 2 ] || usage; PASSWORD="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) log "unknown option: $1"; usage ;;
  esac
done

case "$LOGIN" in
  *"'"*|*'$'*|'') die "invalid login '$LOGIN'" ;;
esac

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Run start-sqlserver.sh first."
# shellcheck source=/dev/null
. "$ENV_FILE"

PORT="${MSSQL_PORT:-1433}"
case "$PORT" in ''|*[!0-9]*) die "invalid port '$PORT'" ;; esac
HOST="127.0.0.1"
assert_local_target "$HOST"

require_sqlcmd
command -v python3 >/dev/null 2>&1 || die "python3 is needed to hash the password."

# ASP.NET Core Identity V3 hash, the format Umbraco stores for backoffice users:
# 0x01 | PRF (2 = HMAC-SHA512) | iterations | salt length | salt | subkey, all
# integers big-endian, base64 encoded.
HASH="$(KINORGE_PW="$PASSWORD" python3 -I -c '
import base64, hashlib, os, struct
pw = os.environ["KINORGE_PW"].encode("utf-8")
salt = os.urandom(16)
iterations = 100000
subkey = hashlib.pbkdf2_hmac("sha512", pw, salt, iterations, 32)
blob = b"\x01" + struct.pack(">III", 2, iterations, len(salt)) + salt + subkey
print(base64.b64encode(blob).decode())
')"

# 61 bytes -> 84 base64 characters, ending in "==".
case "$HASH" in
  *[!A-Za-z0-9+/=]*) die "unexpected characters in the password hash" ;;
esac
[ "${#HASH}" -eq 84 ] || die "unexpected password hash length ${#HASH}"

# The hash goes into the SQL text, not through `sqlcmd -v`: the ODBC sqlcmd
# strips trailing "=" from -v values, which silently corrupts the base64 hash
# and makes the login fail. Base64 has no quote characters, so this is safe.
SQL_FILE="$(mktemp)"
trap 'rm -f "$SQL_FILE"' EXIT
sed "s|\$(HASH)|$HASH|" "$SCRIPT_DIR/sql/local-admin.sql" >"$SQL_FILE"

run_sqlcmd -S "$HOST,$PORT" -U sa -P "${MSSQL_SA_PASSWORD:?}" -C -d "$DB_NAME" -b \
  -v LOGIN="$LOGIN" \
  -i "$SQL_FILE" >&2 \
  || die "could not set the local admin"

STORED="$(run_sqlcmd -S "$HOST,$PORT" -U sa -P "$MSSQL_SA_PASSWORD" -C -d "$DB_NAME" -h -1 -W \
  -v LOGIN="$LOGIN" -Q "SET NOCOUNT ON; SELECT userPassword FROM umbracoUser WHERE userLogin = N'\$(LOGIN)';" | tr -d '[:space:]')"
[ "$STORED" = "$HASH" ] || die "the stored password hash does not match what was written"

log "local admin: $LOGIN"
