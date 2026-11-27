#!/usr/bin/env bash
# Shared helpers for the local database copy scripts.
# Sourced, not executed. Must have no side effects on source.
#
# Ported from the same tooling in Altinn/info.altinn.no (scripts/db).

KINORGE_DB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KINORGE_REPO_ROOT="$(cd "$KINORGE_DB_DIR/../.." && pwd)"
KINORGE_DEFAULT_CONF="$KINORGE_DB_DIR/environments.conf"
KINORGE_NAMESPACE="product-kinorgeportal"
KINORGE_CONTAINER_NAME="kinorge-mssql"
KINORGE_VOLUME_NAME="kinorge-mssql-data"
# The local container's password and port, written by start-sqlserver.sh. Set
# KINORGE_DB_ENV_FILE to keep it elsewhere, such as in an agent that shares
# this checkout with its owner, whose own container's password is in .env.
KINORGE_DB_ENV_FILE="${KINORGE_DB_ENV_FILE:-$KINORGE_DB_DIR/.env}"

log() { printf '%s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# list_environments [conf] -> "prod tt02 "
list_environments() {
  local conf="${1:-$KINORGE_DEFAULT_CONF}"
  awk 'substr($1,1,1) != "#" && NF >= 2 { printf "%s ", $1 }' "$conf"
}

# resolve_environment <env> [conf] -> "<kube-context>"
resolve_environment() {
  local env_name="$1"
  local conf="${2:-$KINORGE_DEFAULT_CONF}"
  [ -f "$conf" ] || die "environment config not found: $conf"

  local result
  result="$(awk -v want="$env_name" '
    substr($1,1,1) != "#" && NF >= 2 && $1 == want { print $2; found = 1; exit }
    END { exit !found }
  ' "$conf")" || die "unknown environment '$env_name'. Available: $(list_environments "$conf")"

  printf '%s\n' "$result"
}

# parse_sql_host <connection string> -> host
#
# Accepts the form the deploy workflow writes:
#   Server=tcp:<host>,1433;Initial Catalog=umbraco;...
parse_sql_host() {
  printf '%s\n' "$1" | awk -F';' '{
    for (i = 1; i <= NF; i++) {
      kv = $i
      sub(/^[ \t]+/, "", kv)
      if (tolower(substr(kv, 1, 7)) == "server=" || tolower(substr(kv, 1, 12)) == "data source=") {
        v = substr(kv, index(kv, "=") + 1)
        sub(/^tcp:/, "", v)
        sub(/,.*$/, "", v)
        print v
        exit
      }
    }
  }'
}

# resolve_sql_host <kube-context> -> host
#
# Read-only. Reads the connection string the running Umbraco pod was given. The
# deploy workflow writes a ${UMBRACO_SQL_CONN_FQDN} placeholder, which Flux
# substitutes in the cluster, so the real host only exists there.
resolve_sql_host() {
  local ctx="$1" dsn host

  if [ -n "${KINORGE_SQL_HOST:-}" ]; then
    is_valid_hostname "$KINORGE_SQL_HOST" || die "invalid KINORGE_SQL_HOST '$KINORGE_SQL_HOST'"
    to_privatelink_host "$KINORGE_SQL_HOST"
    return 0
  fi

  command -v kubectl >/dev/null 2>&1 || die "kubectl not found. Install it, or set KINORGE_SQL_HOST."

  dsn="$(kubectl --context "$ctx" -n "$KINORGE_NAMESPACE" get deploy umbraco --request-timeout=25s \
    -o jsonpath='{.spec.template.spec.containers[?(@.name=="umbraco")].env[?(@.name=="ConnectionStrings__umbracoDbDSN")].value}' \
    2>/dev/null)" || die "cannot read the Umbraco deployment in $ctx.
Is the Altinn VPN on (exit node ts-exit-<env>)? Or set KINORGE_SQL_HOST."

  host="$(parse_sql_host "$dsn")"
  is_valid_hostname "$host" || die "could not find an Azure SQL host in the deployment in $ctx. Set KINORGE_SQL_HOST."
  to_privatelink_host "$host"
}

# to_privatelink_host <host> -> the Private Link name of an Azure SQL host
#
# The deployment holds the public name (<server>.database.windows.net), but the
# server is only reachable through Private Link over the VPN, at
# <server>.privatelink.database.windows.net. Same pattern as info.altinn.no.
to_privatelink_host() {
  case "$1" in
    *.privatelink.database.windows.net) printf '%s\n' "$1" ;;
    *.database.windows.net) printf '%s\n' "${1%.database.windows.net}.privatelink.database.windows.net" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# is_valid_hostname <host> - plain DNS name characters only. Rejects an unsubstituted
# ${...} placeholder and a SQLite path, and keeps the value safe in a connection string.
is_valid_hostname() {
  case "${1:-}" in
    ''|*[!A-Za-z0-9.-]*) return 1 ;;
  esac
  return 0
}

# assert_local_target <host[,port]>
#
# Hard guard: import and any other write action must never reach a remote server.
# This exits rather than prompting. A mistyped argument must be incapable of
# writing to Azure. Do not soften this into a confirmation.
assert_local_target() {
  local raw="${1:-}"
  local host="${raw%%,*}"

  [ -n "$host" ] || die "no target host given; refusing to continue"

  case "$host" in
    *database.windows.net*)
      die "refusing to target Azure SQL host '$host'. Remote environments are read-only; this action only writes to a local container."
      ;;
  esac

  case "$host" in
    localhost|127.0.0.1|::1|'[::1]') return 0 ;;
    *)
      die "refusing to target non-local host '$host'. Allowed targets: localhost, 127.0.0.1, ::1."
      ;;
  esac
}

# find_sqlpackage -> path on stdout
# `dotnet tool install -g` does not put ~/.dotnet/tools on PATH, so check there too.
find_sqlpackage() {
  if command -v sqlpackage >/dev/null 2>&1; then
    command -v sqlpackage
    return 0
  fi
  if [ -x "$HOME/.dotnet/tools/sqlpackage" ]; then
    printf '%s\n' "$HOME/.dotnet/tools/sqlpackage"
    return 0
  fi
  return 1
}

require_sqlpackage() {
  find_sqlpackage >/dev/null 2>&1 || die "sqlpackage not found. Install it with:
  dotnet tool install -g microsoft.sqlpackage
and ensure \$HOME/.dotnet/tools is on your PATH."
}

require_sqlcmd() {
  command -v sqlcmd >/dev/null 2>&1 || die "sqlcmd not found. Install it with:
  brew install sqlcmd                  # macOS
  sudo apt-get install sqlcmd          # Debian/Ubuntu (Microsoft package feed)"
}

# run_sqlcmd <args...>
# GODEBUG: Azure SQL Edge presents a certificate with a negative serial number,
# which the Go sqlcmd rejects before trust is evaluated, so -C alone does not help.
run_sqlcmd() {
  GODEBUG=x509negativeserial=1 sqlcmd "$@"
}

# container_cli -> "docker" | "podman"
container_cli() {
  if [ -n "${CONTAINER_CLI:-}" ]; then printf '%s\n' "$CONTAINER_CLI"; return 0; fi
  if command -v docker >/dev/null 2>&1; then printf 'docker\n'; return 0; fi
  if command -v podman >/dev/null 2>&1; then printf 'podman\n'; return 0; fi
  return 1
}

# cre <args...> - run the container CLI
cre() {
  local cli
  cli="$(container_cli)" || die "no container runtime found. Install docker or podman."
  "$cli" "$@"
}

# tcp_check <host> <port> [timeout_seconds]
#
# Avoids timeout(1), which macOS does not ship. Runs the connect in a subshell
# and reaps it with a watchdog loop.
tcp_check() {
  local host="$1" port="$2" timeout="${3:-5}" waited=0 pid

  ( exec 3<>"/dev/tcp/$host/$port" ) 2>/dev/null &
  pid=$!

  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$timeout" ]; then
      kill "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done

  wait "$pid"
}

# resolve_host_ipv4 <host> -> prints an IPv4 address
#
# bash 3.2 (macOS) resolves /dev/tcp names with gethostbyname, which ignores the
# split-horizon DNS a VPN installs. Resolve with a system resolver first and
# connect to the address, never to the name.
resolve_host_ipv4() {
  local host="$1" ip=""

  if command -v getent >/dev/null 2>&1; then
    ip="$(getent ahostsv4 "$host" 2>/dev/null | awk '/STREAM/ { print $1; exit }')"
    [ -n "$ip" ] || ip="$(getent hosts "$host" 2>/dev/null | awk '{ print $1; exit }')"
  fi
  if [ -z "$ip" ] && command -v dscacheutil >/dev/null 2>&1; then
    ip="$(dscacheutil -q host -a name "$host" 2>/dev/null | awk '/^ip_address:/ { print $2; exit }')"
  fi
  if [ -z "$ip" ] && command -v dig >/dev/null 2>&1; then
    ip="$(dig +short A "$host" 2>/dev/null | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ { print; exit }')"
  fi

  [ -n "$ip" ] || return 1
  printf '%s\n' "$ip"
}

# require_remote_reachable <host> <port>
# Tells a DNS failure and a routing failure apart.
require_remote_reachable() {
  local host="$1" port="$2" ip

  if ! ip="$(resolve_host_ipv4 "$host")"; then
    die "cannot resolve $host.

The database is a Private Link address, so it only resolves over the Altinn VPN.
  1. Connect to the VPN.
  2. If you are connected, your VPN's DNS is not serving the privatelink zone."
  fi

  tcp_check "$ip" "$port" 8 && return 0

  die "$host resolves to $ip, but $ip:$port is not reachable.

DNS works, so this is routing or access rather than the VPN being down:
  1. The VPN may not route this subnet.
  2. Your account may not have been granted access to this database."
}

# get_db_access_token -> Entra access token for Azure SQL on stdout.
# Never log or persist the token.
get_db_access_token() {
  command -v az >/dev/null 2>&1 || die "the Azure CLI is needed. Install it, run 'az login', then retry."

  log "requesting an Entra access token for database.windows.net ..."
  local token
  token="$(az account get-access-token --resource https://database.windows.net/ \
    --query accessToken -o tsv 2>/dev/null || true)"
  [ -n "$token" ] || die "could not get an access token. Run 'az login' and check
that 'az account show' names the tenant that owns the database."
  printf '%s\n' "$token"
}
