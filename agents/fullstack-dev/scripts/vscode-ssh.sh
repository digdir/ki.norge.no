#!/usr/bin/env bash
#
# Run in WSL. Lets VS Code on Windows open an agent's code with Remote-SSH. The agents' SSH hosts only work from
# WSL's ssh, which reaches them through agentctl, so this writes a ssh-wsl.bat that VS Code runs in place of Windows'
# ssh, and prints the VS Code settings that go with it.
set -euo pipefail

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ -n "${WSL_DISTRO_NAME:-}" ] || die "run this in WSL; on Linux or macOS, Remote-SSH works with the agent's host as it is."
command -v cmd.exe >/dev/null || die "cmd.exe is not on the PATH, so Windows cannot be reached from this WSL."
grep -qs 'Include ~/.agent/ssh/config' ~/.ssh/config || agentctl ssh-config install

profile="$(cd /mnt/c && cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')"
[ -n "$profile" ] || die "could not find your Windows user folder."
bat_windows="$profile\\ssh-wsl.bat"
bat="$(wslpath "$bat_windows")"

printf '@echo off\r\nC:\\Windows\\System32\\wsl.exe -d %s ssh %%*\r\n' "$WSL_DISTRO_NAME" >"$bat"
echo "Wrote $bat_windows"

# One entry per agent that exists, and the usual names, so the settings also hold for an agent started later.
hosts="$({
  printf '%s\n' kinorge-fullstack-dev kinorge-fullstack-dev-build kinorge-fullstack-dev-worktree
  agentctl get agents 2>/dev/null | awk 'NR > 1 && $1 ~ /^kinorge-fullstack-dev/ { print $1 }'
} | sort -u)"
platforms="$(printf '%s\n' "$hosts" | sed 's/.*/        "agentctl-&": "linux",/' | sed '$ s/,$//')"

cat <<EOF

Add these to VS Code's user settings, with Ctrl+Shift+P, Preferences: Open User Settings (JSON):

    "remote.SSH.path": "${bat_windows//\\/\\\\}",
    "remote.SSH.useLocalServer": false,
    "remote.SSH.enableDynamicForwarding": false,
    "remote.SSH.remotePlatform": {
$platforms
    },

Then Remote-SSH: Connect to Host..., type agentctl-<agent name>, and open /home/agent/code/ki.norge.no.
EOF
