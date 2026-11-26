# Full-stack developer agent

An [agentctl](https://github.com/digdir/digdir-agents) agent that develops ki.norge.no as a teammate would: the Astro
frontend, the Umbraco CMS and the Cloudflare Workers in front of them. It clones `digdir/ki.norge.no` at boot, builds
and tests what it changes, and shows the result in its pull requests.

| Agent | Image |
| --- | --- |
| `minimal` | `ghcr.io/digdir/ki.norge.no/fullstack-dev-minimal`: the .NET 10 SDK, Node.js, pnpm, Podman, sqlcmd and sqlpackage |
| `desktop` | `ghcr.io/digdir/ki.norge.no/fullstack-dev-desktop`: `minimal` plus Chromium and a graphical desktop, for screenshots |

Both are named `kinorge-fullstack-dev`. Pass `--name` to run both at once. Each has these variants:

| Variant | What it changes |
| --- | --- |
| `nested` | Sized to fit inside another agent, as `kinorge-fullstack-dev-nested` |
| `build` | The image built from this checkout, to try a change to it before CI publishes it, as `kinorge-fullstack-dev-build` |
| `nested-build` | `nested`, with the image built from this checkout, to try a change to it before CI publishes it |
| `worktree` | Mounts this checkout in place of a fresh clone, as `kinorge-fullstack-dev-worktree` |

A variant of your own, such as `agent.mine.yaml`, which Git ignores, can extend any manifest beside it.

## Getting started

With [agentctl installed](https://github.com/digdir/digdir-agents/blob/main/agentctl/README.md#install):

```sh
agentctl claude login
agentctl github login kinorge    # the account it pushes and opens pull requests as
cd agents/fullstack-dev/desktop  # or minimal, without a browser
agentctl apply --wait
agentctl tui
```

`agentctl github login kinorge` takes a fine-grained token with `Contents` and `Pull requests` read and write on
`digdir/ki.norge.no`. Without it the agent still starts, but cannot push. An optional read-only Cloudflare token,
`kinorge-cloudflare-readonly`, lets it read Workers logs and analytics. `agentctl vnc --web` shows the `desktop` agent's
desktop in your browser. [`docs/agentctl.md`](../../docs/agentctl.md) walks through the setup on Windows with WSL,
the tokens, a copy of the database and troubleshooting.

## What it can and cannot do

It runs the frontend's unit tests, typecheck and build, the Workers' tests and `dotnet build`, runs the site and
Umbraco locally, also on a copy of the prod or tt02 database that you export and give it, and takes screenshots on
`desktop`. It cannot export a database itself, which needs the VPN and `kubectl`, nor deploy, or reach any
environment's secrets. Its instructions tell it to say so, and to ask before it changes the schema or uSync.

## The definition

[`instructions.md`](instructions.md), its stage's `environment.md` and [`improving.md`](improving.md) are its
instructions, with [`worktree.md`](worktree.md) on the `worktree` variant.
[`skills/pr-evidence`](skills/pr-evidence/SKILL.md) says what its pull requests show,
[`skills/local-umbraco`](skills/local-umbraco/SKILL.md) how it runs Umbraco on SQLite, and
[`skills/local-prod-db`](skills/local-prod-db/SKILL.md) how it runs it on a copy of prod or tt02, with
[`scripts/stack.sh`](scripts/stack.sh). [`scripts/forward.sh`](scripts/forward.sh) opens that in your own browser, and
[`scripts/vscode-ssh.sh`](scripts/vscode-ssh.sh) lets VS Code on Windows open the agent's code. The images are built
from the [`Dockerfile`](Dockerfile) on the agentctl base images and published by
[`fullstack-dev-agent-images.yml`](../../.github/workflows/fullstack-dev-agent-images.yml) when it changes on `main`.
