#!/usr/bin/env bash
#
# Run on your own machine. Forwards an agent's frontend and Umbraco to localhost, so they open in your browser, until
# Ctrl+C. With --up, it first starts them in the agent with stack.sh.
set -euo pipefail

# The same ports as in stack.sh, and the same on both sides, since the backoffice sends the browser back to its own
# address. They differ from info.altinn.no's agent's, so both can be forwarded at once.
UMBRACO_PORT=43451
WEB_PORT=4331

usage() {
  cat >&2 <<EOF
usage: forward.sh [AGENT] [--up] [--env ENV]

  AGENT      the agent, such as kinorge-fullstack-dev-build; the only ready kinorge-fullstack-dev agent when left out
  --up       first start the database, Umbraco and the frontend in the agent, with stack.sh up. Without it, they
             must already run, as the agent may have started them for a task
  --env ENV  with --up: the environment whose copy to use, prod or tt02; see stack.sh
EOF
  exit 1
}

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

AGENT=""
UP=0
UP_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --up) UP=1 ;;
    --env)
      [ $# -ge 2 ] || usage
      UP=1
      UP_ARGS+=(--env "$2")
      shift
      ;;
    -h | --help | -*) usage ;;
    *) [ -z "$AGENT" ] || usage; AGENT="$1" ;;
  esac
  shift
done

if [ -z "$AGENT" ]; then
  ready="$(agentctl get agents | awk 'NR > 1 && $1 ~ /^kinorge-fullstack-dev/ && $2 == "True" { print $1 }')"
  case "$(printf '%s' "$ready" | grep -c .)" in
    0) die "no kinorge-fullstack-dev agent is ready. Name the agent, or start one as docs/agentctl.md, step 5, says." ;;
    1) AGENT="$ready" ;;
    *) die "several agents are ready, so name one: $(echo "$ready" | tr '\n' ' ')" ;;
  esac
fi

for port in "$WEB_PORT" "$UMBRACO_PORT"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    die "port $port is in use on this machine, perhaps by another forward of a ki.norge.no agent. Stop it first."
  fi
done

if [ "$UP" = 1 ]; then
  echo "==> starting the stack in $AGENT, which takes a few minutes the first time"
  agentctl exec "$AGENT" -- bash -c '
    script=~/code/ki.norge.no/agents/fullstack-dev/scripts/stack.sh
    if [ ! -x "$script" ]; then
      echo "error: the agent'\''s checkout has no $script, since its branch, $(git -C ~/code/ki.norge.no branch --show-current), is older than the script. Check out one that has it:" >&2
      echo "  agentctl exec '"$AGENT"' -- git -C /home/agent/code/ki.norge.no checkout <branch>" >&2
      exit 1
    fi
    "$script" up "$@"' stack.sh "${UP_ARGS[@]}"
else
  # agentctl port-forward reaches the agent's 127.0.0.1, so that is where they must answer.
  codes="$(agentctl exec "$AGENT" -- bash -c '
    for url in http://127.0.0.1:'"$UMBRACO_PORT"'/umbraco http://127.0.0.1:'"$WEB_PORT"'/; do
      curl -s -o /dev/null -m 30 -w "%{http_code} " "$url" || true
    done')"
  if [ "$codes" != "200 200 " ]; then
    die "Umbraco and the frontend do not both answer in $AGENT (HTTP $codes). Start them with: forward.sh $AGENT --up"
  fi
fi

copy="$(agentctl exec "$AGENT" -- bash -c 'cut -d" " -f1 ~/.config/kinorge-db/imported 2>/dev/null' || true)"
cat <<EOF

==> forwarding from $AGENT, on a copy of ${copy:-an environment that is not recorded}, until Ctrl+C. Open:
  frontend   http://localhost:$WEB_PORT
  Umbraco    http://localhost:$UMBRACO_PORT/umbraco, as admin@ki.norge.no with the local password in CLAUDE.md

EOF
exec agentctl port-forward "$AGENT" "$WEB_PORT:$WEB_PORT" "$UMBRACO_PORT:$UMBRACO_PORT"
