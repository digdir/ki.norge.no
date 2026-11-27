#!/usr/bin/env bash
# Unit tests for scripts/db/lib.sh. No network, no containers.
#   bash scripts/db/tests/test-lib.sh
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib.sh
. "$TESTS_DIR/../lib.sh"

PASS=0
FAIL=0

assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1)); printf 'ok   %s\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$label" "$expected" "$actual"
  fi
}

assert_fails() {
  local label="$2"
  if ( eval "$1" ) >/dev/null 2>&1; then
    FAIL=$((FAIL + 1)); printf 'FAIL %s (expected non-zero exit)\n' "$label"
  else
    PASS=$((PASS + 1)); printf 'ok   %s\n' "$label"
  fi
}

assert_succeeds() {
  local label="$2"
  if ( eval "$1" ) >/dev/null 2>&1; then
    PASS=$((PASS + 1)); printf 'ok   %s\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL %s (expected zero exit)\n' "$label"
  fi
}

FIXTURE="$(mktemp)"
cat >"$FIXTURE" <<'EOF'
# env   kube-context
prod    ctx-prod
#tt02   ctx-tt02
EOF

assert_eq "ctx-prod" "$(resolve_environment prod "$FIXTURE")" "resolve_environment returns the kube context"
assert_eq "prod" "$(list_environments "$FIXTURE" | tr -d ' ')" "list_environments omits commented entries"
assert_fails "resolve_environment tt02 '$FIXTURE'" "commented environment is not resolvable"
assert_fails "resolve_environment nope '$FIXTURE'" "unknown environment exits non-zero"
rm -f "$FIXTURE"

assert_eq "prod tt02" "$(list_environments | sed 's/ $//')" "shipped environments.conf lists prod and tt02"

assert_eq "sql-x.privatelink.database.windows.net" \
  "$(parse_sql_host 'Server=tcp:sql-x.privatelink.database.windows.net,1433;Initial Catalog=umbraco;Encrypt=True')" \
  "parse_sql_host reads the workflow's connection string"
assert_eq "db.example" "$(parse_sql_host 'Initial Catalog=umbraco; Data Source=db.example')" "parse_sql_host accepts Data Source"
assert_fails "is_valid_hostname \"\$(parse_sql_host 'Data Source=|DataDirectory|/Umbraco.sqlite.db')\"" "SQLite path is not a valid SQL host"
assert_fails "is_valid_hostname \"\$(parse_sql_host 'Server=tcp:\${UMBRACO_SQL_CONN_FQDN},1433')\"" "unsubstituted placeholder is not a valid SQL host"
assert_succeeds "is_valid_hostname sql-x.privatelink.database.windows.net" "Azure SQL name is a valid host"
assert_eq "h.example" "$(KINORGE_SQL_HOST=h.example resolve_sql_host any-ctx)" "KINORGE_SQL_HOST skips the kubectl lookup"
assert_eq "sql-x.privatelink.database.windows.net" "$(to_privatelink_host sql-x.database.windows.net)" "public Azure SQL name becomes the privatelink name"
assert_eq "sql-x.privatelink.database.windows.net" "$(to_privatelink_host sql-x.privatelink.database.windows.net)" "privatelink name is left as it is"
assert_eq "sql-x.privatelink.database.windows.net" "$(KINORGE_SQL_HOST=sql-x.database.windows.net resolve_sql_host any-ctx)" "KINORGE_SQL_HOST public name becomes privatelink"
assert_fails "KINORGE_SQL_HOST='h;Server=x' resolve_sql_host any-ctx" "KINORGE_SQL_HOST with ; is rejected"

assert_succeeds "assert_local_target localhost" "localhost allowed"
assert_succeeds "assert_local_target 127.0.0.1" "127.0.0.1 allowed"
assert_succeeds "assert_local_target 'localhost,1433'" "host with port allowed"
assert_fails "assert_local_target sql-x.privatelink.database.windows.net" "azure sql host rejected"
assert_fails "assert_local_target 'sql-x.database.windows.net,1433'" "azure sql host with port rejected"
assert_fails "assert_local_target 10.0.0.5" "arbitrary remote host rejected"
assert_fails "assert_local_target ''" "empty host rejected"

START="$(date +%s)"
assert_fails "tcp_check 127.0.0.1 9 2" "tcp_check fails on a closed port"
ELAPSED=$(( $(date +%s) - START ))
if [ "$ELAPSED" -le 6 ]; then
  PASS=$((PASS + 1)); printf 'ok   tcp_check respects its timeout (%ss)\n' "$ELAPSED"
else
  FAIL=$((FAIL + 1)); printf 'FAIL tcp_check took %ss\n' "$ELAPSED"
fi

# The env file defaults to scripts/db/.env and follows KINORGE_DB_ENV_FILE.
assert_eq "$KINORGE_DB_DIR/.env" "$KINORGE_DB_ENV_FILE" "env file defaults to scripts/db/.env"
assert_eq "/tmp/elsewhere.env" "$(KINORGE_DB_ENV_FILE=/tmp/elsewhere.env bash -c ". '$TESTS_DIR/../lib.sh'; printf '%s' \"\$KINORGE_DB_ENV_FILE\"")" "env file follows KINORGE_DB_ENV_FILE"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
