#!/usr/bin/env bash
#
# Runs Umbraco on a local copy of an environment's database and the Astro frontend against it, inside the agent's
# sandbox, so both can be opened in a browser outside it through forward.sh. Each step is skipped when it is already
# done, so `up` can be run again at any time.
set -euo pipefail

usage() {
  cat >&2 <<EOF
usage: stack.sh up [--env ENV] [--import] | down [--db] | status

  up         start the database, Umbraco and the frontend, and wait until each answers
  --env ENV  the environment whose copy to use, one of: $(list_environments)
             The default is the one already imported, or prod when there is none.
  --import   import the newest .bacpac again, replacing the database and what was changed in it
  down       stop the frontend and Umbraco
  --db       also stop the database container, which keeps its data
  status     show what runs
EOF
  exit 1
}

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CMS="$REPO/apps/cms-umbraco"
WEB="$REPO/apps/frontend"
CONFIG_DIR="$HOME/.config/kinorge-db"
UMBRACO_ENV="$CONFIG_DIR/umbraco.env"
# Which environment's copy the database holds, and from which file, as "<env> <file>".
IMPORTED_FILE="$CONFIG_DIR/imported"
# Not the ports ki.norge.no uses on a developer's machine (4321, 5000 and 44391), nor info.altinn.no's agent's (4321
# and 43450), so forward.sh can run next to either. forward.sh has the same two.
UMBRACO_PORT=43451
WEB_PORT=4331
UMBRACO_URL="http://localhost:$UMBRACO_PORT"
UMBRACO_LOG=/tmp/umbraco.log

# shellcheck source=../../../scripts/db/lib.sh
. "$REPO/scripts/db/lib.sh"

http_code() {
  curl -s -o /dev/null -m "${2:-5}" -w '%{http_code}' "$1" 2>/dev/null || true
}

listen_pid() {
  { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; } || true
}

# has_env <port> <NAME=value>: whether the process listening on the port was started with that variable.
has_env() {
  local pid
  pid="$(listen_pid "$1")"
  [ -n "$pid" ] && tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | grep -qxF "$2"
}

# wait_for <url> <seconds> <name> <command that shows the log> [pid]: until the URL answers 200, or fail with the log.
wait_for() {
  local url="$1" deadline=$((SECONDS + $2)) name="$3" show_log="$4" pid="${5:-}"
  log "    waiting for $name at $url (up to $2 s)"
  until [ "$(http_code "$url" 30)" = 200 ]; do
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      eval "$show_log" >&2 || true
      die "$name exited"
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      eval "$show_log" >&2 || true
      die "$name did not answer in time"
    fi
    sleep 3
  done
}

# stop_pid <pid>: also when it is suspended, as after Ctrl+Z, when it would ignore the TERM.
stop_pid() {
  local pid="$1"
  kill -CONT "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || return 0; sleep 0.5; done
  kill -9 "$pid" 2>/dev/null || true
}

db_state() {
  cre inspect -f '{{.State.Status}}' "$KINORGE_CONTAINER_NAME" 2>/dev/null || echo missing
}

imported_env() {
  [ -f "$IMPORTED_FILE" ] && cut -d' ' -f1 "$IMPORTED_FILE" || true
}

db_up() {
  local state imported env bacpac
  state="$(db_state)"
  imported="$(imported_env)"
  if [ "$IMPORT" = 1 ] || [ "$state" = missing ] || [ ! -f "$UMBRACO_ENV" ]; then
    env="${ENV_NAME:-${imported:-prod}}"
    # shellcheck disable=SC2012
    bacpac="$(ls -t "$REPO/.bacpacs/$env-umbraco-"*.bacpac 2>/dev/null | head -1 || true)"
    [ -n "$bacpac" ] ||
      die "no copy of $env in $REPO/.bacpacs. docs/agentctl.md, step 6, says how to give the agent one."
    umbraco_down
    log "==> importing $(basename "$bacpac"), which takes a few minutes"
    rm -f "$IMPORTED_FILE"
    "$REPO/scripts/db/refresh-local-db.sh" "$env" --skip-export --env-out "$UMBRACO_ENV" >/dev/null
    echo "$env $(basename "$bacpac")" >"$IMPORTED_FILE"
    return
  fi
  if [ -n "$ENV_NAME" ] && [ "$ENV_NAME" != "$imported" ]; then
    if [ -n "$imported" ]; then
      die "the database is a copy of $imported. Add --import to replace it with the newest copy of $ENV_NAME."
    fi
    log "warning: which environment the database is a copy of is not recorded. Add --import to be sure it is $ENV_NAME."
  fi
  if [ "$state" != running ]; then
    log "==> starting the database"
    cre start "$KINORGE_CONTAINER_NAME" >/dev/null
    # shellcheck source=/dev/null
    . "$KINORGE_DB_ENV_FILE"
    local deadline=$((SECONDS + 120))
    until run_sqlcmd -S "127.0.0.1,$MSSQL_PORT" -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" >/dev/null 2>&1; do
      [ "$SECONDS" -lt "$deadline" ] || die "the database did not start. See: docker logs $KINORGE_CONTAINER_NAME"
      sleep 2
    done
  else
    log "==> the database runs"
  fi
}

# Whether the running Umbraco is the one this script starts: with uSync owning the schema, and with the backoffice
# sign-in over plain HTTP.
umbraco_ours() {
  has_env "$UMBRACO_PORT" 'Umbraco__CMS__Global__UseHttps=false' && has_env "$UMBRACO_PORT" 'USYNC_OWNS_SCHEMA=true'
}

umbraco_up() {
  if [ "$(http_code "http://127.0.0.1:$UMBRACO_PORT/umbraco")" = 200 ] && umbraco_ours; then
    log "==> Umbraco runs"
    return
  fi
  umbraco_down
  log "==> starting Umbraco, which builds it first"
  node "$REPO/scripts/sync-content-routes.js" >/dev/null
  (
    cd "$CMS"
    set -a
    # shellcheck source=/dev/null
    . "$UMBRACO_ENV"
    set +a
    # USYNC_OWNS_SCHEMA as cms:dev:db-copy sets it, so ContentTypeComposer leaves the copy's schema alone, as in prod.
    # Development leaves UseHttps at Umbraco's default, true, so the backoffice sign-in refuses plain HTTP, and sends
    # the browser back to https://localhost:44391, which serves nothing here. The preview links go to this frontend.
    export ASPNETCORE_ENVIRONMENT=Development \
      USYNC_OWNS_SCHEMA=true \
      Umbraco__CMS__Global__UseHttps=false \
      Umbraco__CMS__Security__BackOfficeHost="$UMBRACO_URL" \
      HeadlessPreview__FrontendUrl="http://localhost:$WEB_PORT"
    setsid nohup dotnet run --urls "$UMBRACO_URL" </dev/null >"$UMBRACO_LOG" 2>&1 &
    echo $! >/tmp/umbraco.pid
  )
  wait_for "http://127.0.0.1:$UMBRACO_PORT/umbraco" 600 Umbraco \
    "tail -20 $UMBRACO_LOG; echo 'The whole log is in $UMBRACO_LOG'" "$(cat /tmp/umbraco.pid)"
}

umbraco_down() {
  local pid
  pid="$(listen_pid "$UMBRACO_PORT")"
  if [ -n "$pid" ]; then
    log "==> stopping Umbraco"
    stop_pid "$pid"
  fi
  if [ -f /tmp/umbraco.pid ]; then
    stop_pid "$(cat /tmp/umbraco.pid)"
    rm -f /tmp/umbraco.pid
  fi
}

web_up() {
  local file
  if [ "$(http_code "http://127.0.0.1:$WEB_PORT/" 60)" = 200 ] && has_env "$WEB_PORT" "UMBRACO_URL=$UMBRACO_URL"; then
    log "==> the frontend runs"
    return
  fi
  for file in "$WEB/.env" "$WEB/.dev.vars"; do
    if [ -f "$file" ] && grep -q '^UMBRACO_URL=' "$file"; then
      log "warning: $file sets UMBRACO_URL, which may point the frontend away from the local Umbraco."
    fi
  done
  web_down
  log "==> starting the frontend"
  (
    cd "$REPO"
    [ -d "$WEB/node_modules" ] || pnpm install --frozen-lockfile >/dev/null
    cd "$WEB"
    # --background, since Astro goes to the background by itself when an agent runs it, and otherwise not. This way it
    # always keeps its log for `astro dev logs`, and `astro dev stop` stops it. 127.0.0.1, since that is where
    # agentctl port-forward connects; without --host, Astro listens on ::1 only.
    UMBRACO_URL="$UMBRACO_URL" pnpm exec astro dev --background --host 127.0.0.1 --port "$WEB_PORT" </dev/null >/dev/null
  )
  # The first page takes a while: Vite prepares its dependencies, and the page waits on Umbraco.
  wait_for "http://127.0.0.1:$WEB_PORT/" 180 "the frontend" "(cd '$WEB' && pnpm exec astro dev logs | tail -20)"
}

web_down() {
  local pid
  # Astro refuses to start while another of its dev servers runs, even one that is suspended.
  (cd "$WEB" && pnpm exec astro dev stop >/dev/null 2>&1) || true
  pid="$(listen_pid "$WEB_PORT")"
  if [ -n "$pid" ]; then
    log "==> stopping the frontend"
    stop_pid "$pid"
  fi
}

status() {
  local ours=no copy="which copy is not recorded"
  umbraco_ours && ours=yes
  [ -f "$IMPORTED_FILE" ] && copy="a copy of $(sed 's/ /, from /' "$IMPORTED_FILE")"
  printf '%-12s %s, %s\n' database "$(db_state)" "$copy"
  printf '%-12s HTTP %s, started by stack.sh: %s\n' Umbraco "$(http_code "http://127.0.0.1:$UMBRACO_PORT/umbraco")" "$ours"
  printf '%-12s HTTP %s\n' frontend "$(http_code "http://127.0.0.1:$WEB_PORT/" 30)"
}

[ $# -ge 1 ] || usage
command="$1"
shift
IMPORT=0
DB_DOWN=0
ENV_NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --import) IMPORT=1 ;;
    --db) DB_DOWN=1 ;;
    --env)
      [ $# -ge 2 ] || usage
      ENV_NAME="$2"
      case " $(list_environments)" in *" $ENV_NAME "*) ;; *) die "unknown environment '$ENV_NAME'. Use one of: $(list_environments)" ;; esac
      shift
      ;;
    *) usage ;;
  esac
  shift
done

case "$command" in
  up)
    db_up
    umbraco_up
    web_up
    copy="$(imported_env)"
    copy="${copy:-an environment that is not recorded}"
    cat <<EOF

Running, on a copy of $copy. From your machine, run agents/fullstack-dev/scripts/forward.sh $(hostname), and open:
  frontend   http://localhost:$WEB_PORT
  Umbraco    $UMBRACO_URL/umbraco, as admin@ki.norge.no with the local password in CLAUDE.md
Logs: $UMBRACO_LOG, and for the frontend: cd apps/frontend && pnpm exec astro dev logs
EOF
    ;;
  down)
    web_down
    umbraco_down
    if [ "$DB_DOWN" = 1 ]; then
      log "==> stopping the database"
      cre stop "$KINORGE_CONTAINER_NAME" >/dev/null
    fi
    ;;
  status) status ;;
  *) usage ;;
esac
