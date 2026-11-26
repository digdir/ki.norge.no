# Developing with agentctl

[agentctl](https://github.com/digdir/digdir-agents/blob/main/agentctl/README.md) runs Claude Code in a small virtual
machine (a sandbox) on your own machine. The agent gets only the access you give it, real secrets never enter the
sandbox (it sees placeholders, and your machine puts the real values into requests to the allowed hosts), and it can
work without permission prompts. Sessions keep running when you disconnect.

This guide sets it up on Windows with WSL2. The agent itself is described in
[`agents/fullstack-dev/README.md`](../agents/fullstack-dev/README.md). If you already run the info.altinn.no agent,
steps 1 and 2 are done, and both agents can run at the same time.

## 1. Prepare WSL

The sandbox needs `/dev/kvm`, which only members of the `kvm` group can use:

```sh
sudo usermod -aG kvm $USER
```

Then restart WSL from PowerShell with `wsl --shutdown`, and check in a new WSL terminal that `id` lists `kvm`.

## 2. Install agentctl and log in to Claude

```sh
curl -fsSL https://raw.githubusercontent.com/digdir/digdir-agents/main/agentctl/install.sh | sh
```

It installs to `~/.local/bin`, which Ubuntu only puts on `PATH` in shells started after that folder exists. Open a new
WSL terminal, and check that `agentctl --version` answers. If it still says `command not found`, your shell does not
add the folder, so add it yourself:

```sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc   # ~/.zshrc for zsh
exec bash -l
```

Then log in:

```sh
agentctl claude login
agentctl skills install --bundled agentctl --user   # lets Claude Code on your machine drive agents
```

Always log in on your machine like this, never with `/login` inside a session: that would put the real credential in
the sandbox.

## 3. GitHub token

```sh
agentctl github login kinorge
```

Choose **create a fine-grained token**, and fill in GitHub's form:

| Field | Value |
|---|---|
| Resource owner | `digdir` |
| Repository access | Only `ki.norge.no` |
| Expiration | 30–90 days |
| Contents, Pull requests, Issues | Read and write |
| Commit statuses, Metadata | Read-only |
| Actions | **Read-only** (read and write lets it start workflows, including deploys) |
| Workflows | **No access** (write lets it change workflows, which run with the repository's secrets) |

The agent's commits and pull requests show as the token's user, which is you. Renew the token by running the command
again.

The login is named `kinorge`, not `default`, which info.altinn.no's agent uses, since one fine-grained token cannot
reach repositories of both `Altinn` and `digdir`.

## 4. Cloudflare token (optional)

Only needed for tasks that read Cloudflare's logs or analytics. In the Cloudflare dashboard: **My Profile → API Tokens
→ Create Token → Custom**.

- **Account policy**, the Digdir account: _Account Analytics_ → Read, _Workers Observability_ → Read.
- **Zone policy**, only `norge.no`: _Analytics_ → Read.
- Nothing with Edit. No IP filtering. Expiry about 30 days.

Then store it:

```sh
agentctl secret set kinorge-cloudflare-readonly --hosts api.cloudflare.com
agentctl secret list
```

The agent sees it as `CLOUDFLARE_API_TOKEN`. The account is shared with other Digdir services, whose logs the token
can read as well. Logs can hold personal data such as IP addresses, and what the agent reads goes to the model.

## 5. Start the agent

```sh
cd ~/ki.norge.no/agents/fullstack-dev/desktop     # or minimal, without a browser
agentctl apply --wait --timeout 30m
agentctl attach session/main --agent kinorge-fullstack-dev
```

The first start pulls the image, which takes a while. Other ways in: `agentctl tui` (all agents and sessions),
`agentctl ssh kinorge-fullstack-dev` (a shell), `agentctl vnc kinorge-fullstack-dev --web` (the desktop in a browser).

The code is the agent's own clone in `~/code/ki.norge.no`, not your checkout. Its changes reach you as branches and
pull requests. Step 8 shows how to look at it in VS Code.

To try a change to the image before CI publishes it, use the `build` variant, which builds it on your machine and
runs as `kinorge-fullstack-dev-build`. Use that name wherever this guide says `kinorge-fullstack-dev`:

```sh
agentctl apply --variant build --wait --timeout 30m
```

## 6. Give it a copy of a database (optional)

For tasks that need real content, the agent runs Umbraco on a copy of `prod` or `tt02`. It cannot export one itself,
so you do, on your machine, with the access and tools [local-database-copy.md](local-database-copy.md) lists, and copy
the file in. For prod:

```sh
agentctl ssh-config install    # once: lets ssh and scp reach agents as agentctl-<agent name>
cd ~/ki.norge.no
scripts/db/export-bacpac.sh prod
ssh agentctl-kinorge-fullstack-dev mkdir -p code/ki.norge.no/.bacpacs
scp .bacpacs/prod-umbraco-<timestamp>.bacpac agentctl-kinorge-fullstack-dev:code/ki.norge.no/.bacpacs/
```

There is nothing more to do. The newest copy is imported the first time Umbraco starts without a database: when you
start it in step 7, or when the agent needs real content for a task. On the `worktree` variant the agent sees
your `.bacpacs/` already, so skip the `ssh` and `scp` lines.

A copy of prod holds real editor accounts and personal data. Give it to the agent only for a task that needs it, and
remove it again when the task is done:

```sh
agentctl exec kinorge-fullstack-dev -- bash -c 'docker rm -f kinorge-mssql; docker volume rm kinorge-mssql-data; rm -f ~/code/ki.norge.no/.bacpacs/*.bacpac'
```

For newer content later, or tt02, export and copy in again, then import it. That replaces the database, and with it
what was changed there:

```sh
agentctl exec kinorge-fullstack-dev -- bash -c '~/code/ki.norge.no/agents/fullstack-dev/scripts/stack.sh up --env tt02 --import'
```

Without `--env`, it keeps the environment it has, or uses prod when it has none. To have one agent on prod and
another on tt02 at the same time, start each under its own name, with
`agentctl apply --name kinorge-prod` and `agentctl apply --name kinorge-tt02`. Each is its own machine, with its own
database.

## 7. Open it in your own browser (optional)

To look at the agent's frontend and Umbraco yourself, run this from your checkout in WSL, and leave it running:

```sh
agents/fullstack-dev/scripts/forward.sh kinorge-fullstack-dev --up    # the first time: starts them in the agent
agents/fullstack-dev/scripts/forward.sh kinorge-fullstack-dev         # when they run already
```

`--up` starts the database, Umbraco and the frontend in the agent with
[`stack.sh`](../agents/fullstack-dev/scripts/stack.sh), which takes a few minutes the first time, and `--env tt02`
picks the environment as above. Without `--up`, it leaves the agent's servers as they are, since the agent may have
started them for a task, and only says so when they do not answer. Either way, it forwards them to your machine until
Ctrl+C, and says which environment's copy they run on. Then open, also in Windows:

- the frontend at http://localhost:4331
- the backoffice at http://localhost:43451/umbraco, signed in as `admin@ki.norge.no` with the local password in
  [`CLAUDE.md`](../CLAUDE.md), which the import gives the copy. What you publish there shows on the frontend.

The ports are the same as in the agent, and differ from what ki.norge.no uses when you run it yourself (4321 and 5000)
and from info.altinn.no's agent (4321 and 43450), so this runs next to those. One ki.norge.no agent can be forwarded
at a time: Ctrl+C, and forward another to switch. The servers keep running in the agent after Ctrl+C; stop them with
`agentctl exec <agent> -- bash -c '~/code/ki.norge.no/agents/fullstack-dev/scripts/stack.sh down'`.
The agent's checkout needs a branch that has `stack.sh`.

## 8. Look at its code in VS Code (optional)

VS Code's Remote-SSH extension opens the agent's checkout as it is, with its changes as it makes them, without copying
anything out. The agent's SSH host only works from WSL's `ssh`, though, so VS Code on Windows needs a wrapper. Install
the **Remote - SSH** extension in VS Code on Windows, and run this in WSL:

```sh
agents/fullstack-dev/scripts/vscode-ssh.sh
```

It writes `ssh-wsl.bat` to your Windows user folder and prints four settings. Add them to VS Code's user settings
(Ctrl+Shift+P → _Preferences: Open User Settings (JSON)_). If you did this for info.altinn.no's agent, add the new
entries under `remote.SSH.remotePlatform` to the ones you have. Then run _Remote-SSH: Connect to Host…_, type
`agentctl-<agent name>`, such as `agentctl-kinorge-fullstack-dev`, and open `/home/agent/code/ki.norge.no`.

Without `remotePlatform`, it waits for an answer to a question that is easy to miss, at the top of the window. Without
`enableDynamicForwarding: false`, it fails with `ECONNREFUSED`, since it connects before WSL has passed the port on to
Windows. Read rather than edit while the agent works, or you change the same files at once.

## 9. Check that it works

| What | How | Expected |
|---|---|---|
| Repo cloned | `agentctl describe agent/<name>` | `Workspace True Cloned` |
| Claude account | `/status` in a session | Your account |
| GitHub | Ask the agent to open a test pull request | It opens; close it afterwards |
| Cloudflare secret | Ask: _"Is `CLOUDFLARE_API_TOKEN` set? Give its length and first 6 characters, and call `https://api.cloudflare.com/client/v4/user/tokens/verify`."_ | A placeholder starting with `$AGENT`, and `"status": "active"` |
| Cloudflare write | Ask it to create a KV namespace with wrangler | `Authentication error` |
| A copy of prod | `forward.sh --up`, then open the frontend and sign in to the backoffice | Prod's pages, without images |

A secret stored after a session started may need a new session.

## Troubleshooting

**`sandbox process exited (signal: 6 (SIGABRT))`.** See the sandbox log with
`tail -5 ~/.agent/microsandbox/runtime/sandboxes/*/logs/runtime.log`. `Error creating the Kvm object: Error(13)` means
no access to `/dev/kvm`: either you are not in the `kvm` group (step 1), or `agentd` started before you joined it.
In a terminal where `id` lists `kvm`, run `pkill -x agentd` and then any `agentctl` command, which starts it again.

**`apply --wait` times out.** The build carries on in the background. Check it:

```sh
agentctl get agents                       # READY True when done
agentctl describe agent/<name>            # "→ Resolve sandbox image (Nm)" while building
pstree -apl $(pgrep -f buildah-oci-runtime) | grep -v '{exe}' | head   # the step running now
```

An `exit status` under _Conditions_ can be from an earlier attempt.

**A local build hangs or crawls.** Ubuntu's own servers (`archive.ubuntu.com`, `security.ubuntu.com`) are sometimes
very slow. If `apt-get` makes no progress, `pkill -f "apt-get install"` makes agentd retry the step. To build from a
fast mirror, change the default locally, build, and undo it:

```sh
sed -i 's|^ARG APT_MIRROR=$|ARG APT_MIRROR=http://no.archive.ubuntu.com/ubuntu|' ../Dockerfile
agentctl apply --variant build --wait --timeout 30m
git -C ~/ki.norge.no checkout agents/fullstack-dev/Dockerfile
```

CI uses Azure's mirror for amd64 the same way. The images keep Ubuntu's own sources.

**`Agent resource changed concurrently` after `delete`.** The agent stays at `Terminating` until a running build
ends. Stop it with `pkill -f "apt-get install"`.

**`forward.sh` says a port is in use.** Another forward of a ki.norge.no agent runs, or something else listens on
4331 or 43451. Stop it first.

**Podman instead of Docker.** Local builds work with a Podman engine that answers to `docker`.
