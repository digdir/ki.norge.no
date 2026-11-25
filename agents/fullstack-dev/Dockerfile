# The images of the full-stack developer agent for ki.norge.no, built on the agentctl base images
# (https://github.com/digdir/digdir-agents/blob/main/images/agentctl-base/README.md). `minimal` has what the frontend,
# the Workers and the Umbraco CMS need to build and test. `desktop` adds Chromium and a graphical desktop, for
# screenshots of pages, stories and the backoffice. .github/workflows/fullstack-dev-agent-images.yml publishes both.
FROM ghcr.io/digdir/agentctl-base:ubuntu-26.04-v0.1.0-preview.15@sha256:dd96a8413e1890b58ae4cde092bfc8b97fcb9e221822fdcb8bb3dc26466be949 AS minimal

# The base ends as the unprivileged agent user; installing packages needs root again.
USER root

# An Ubuntu mirror for this stage's packages, restored at its end. CI passes Azure's mirror for amd64, where
# archive.ubuntu.com and security.ubuntu.com are often slow from GitHub's runners. Empty by default, so local builds
# use Ubuntu's own sources. The script is mounted, not copied, so it is not in the image.
ARG APT_MIRROR=
RUN --mount=type=bind,source=common/apt-mirror.sh,target=/tmp/apt-mirror.sh sh /tmp/apt-mirror.sh use "${APT_MIRROR}"

# The .NET SDK the Umbraco project targets (net10.0), from Ubuntu, whose security updates keep it patched. The
# repository pins no SDK patch version, and apps/cms-umbraco/Dockerfile builds on mcr.microsoft.com/dotnet/sdk:10.0.
# python3 hashes the local admin's password in scripts/db/set-local-admin.sh.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends dotnet-sdk-10.0 bzip2 python3 \
    && rm -rf /var/lib/apt/lists/* \
    && dotnet --version

ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
ENV DOTNET_NOLOGO=1
# Where `dotnet tool install --global` puts the tools the agent installs itself.
ENV PATH=/home/agent/.dotnet/tools:${PATH}

# pnpm at the version and checksum `packageManager` in the repository's package.json pins. CI runs Node.js 24, as the
# base image has. npm's cache goes to /tmp, since HOME is /home/agent in this step too.
ARG PNPM_VERSION=12.21.0
ARG PNPM_SHA512=66fd8278ee28935ce951792d34367ff3af5c432a2756445823029533835b8da529bbe0be5130afd56ed0713fb8789e47bad82d93bd5ae2fe54b15562d6276ef0
RUN if [ -r /run/agent/tls/ca-bundle.pem ]; then export NODE_EXTRA_CA_CERTS=/run/agent/tls/ca-bundle.pem; fi \
    && curl -fsSL "https://registry.npmjs.org/pnpm/-/pnpm-${PNPM_VERSION}.tgz" -o /tmp/pnpm.tgz \
    && echo "${PNPM_SHA512}  /tmp/pnpm.tgz" | sha512sum -c - \
    && npm install --global --cache /tmp/npm-cache --no-audit --no-fund /tmp/pnpm.tgz \
    && rm -rf /tmp/pnpm.tgz /tmp/npm-cache \
    && pnpm --version

# Podman, with the `docker` command, for SQL Server in scripts/db and the Umbraco image.
RUN agent-feature install containers

# sqlcmd and sqlpackage, for scripts/db to import a copy of the prod database that the person who created the agent
# exported on their machine (the local-prod-db skill). Ubuntu packages neither. sqlcmd is Microsoft's Go build, pinned
# by checksum per architecture. HOME is /home/agent in this step too, so dotnet's NuGet caches go to a HOME in /tmp,
# which is removed: left in /home/agent, they would be root's, and the agent's own restores would fail on them.
ARG TARGETARCH
ARG SQLCMD_VERSION=1.10.0
ARG SQLPACKAGE_VERSION=170.5.96
RUN case "${TARGETARCH}" in \
        amd64) sha256=92516d98c63d99b0994de5b61350c91f6915f9b76f139a59039fbcb225c2e987 ;; \
        arm64) sha256=9faaa981f9c374f319ac796dedb4678499b8596c87d5b6c512e9b0e7a3b74f8e ;; \
        *) echo "no sqlcmd checksum for ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/microsoft/go-sqlcmd/releases/download/v${SQLCMD_VERSION}/sqlcmd-linux-${TARGETARCH}.tar.bz2" -o /tmp/sqlcmd.tar.bz2 \
    && echo "${sha256}  /tmp/sqlcmd.tar.bz2" | sha256sum -c - \
    && tar -xjf /tmp/sqlcmd.tar.bz2 -C /usr/local/bin sqlcmd \
    && rm /tmp/sqlcmd.tar.bz2 \
    && mkdir /tmp/sqlpackage-home \
    && HOME=/tmp/sqlpackage-home dotnet tool install --tool-path /opt/sqlpackage microsoft.sqlpackage --version "${SQLPACKAGE_VERSION}" \
    && ln -s /opt/sqlpackage/sqlpackage /usr/local/bin/sqlpackage \
    && rm -rf /tmp/sqlpackage-home \
    && sqlcmd --version && sqlpackage /version
# The SQL Server container's password goes outside the checkout, which on the worktree variant is its owner's, with
# their own container's password in scripts/db/.env.
ENV KINORGE_DB_ENV_FILE=/home/agent/.config/kinorge-db/sqlserver.env

# agentctl and agentd, so the agent can try changes to its own definition in nested agents.
COPY --from=ghcr.io/digdir/agentctl:v0.1.0-preview.15@sha256:1bc767955b6740c4b65e402332e8099154a0da8a4a80ae8f778182647dcdf40e /agentctl /agentd /usr/local/bin/

# The repository to clone at boot.
# --chmod, so the image does not depend on the file's mode in the checkout: a file only its owner can read would leave
# the clone service unable to read the list.
COPY --chmod=0644 common/workspace.list /etc/agent-workspace.d/ki-norge-no.list

# Back to Ubuntu's own sources, so the image does not depend on the build's mirror.
RUN --mount=type=bind,source=common/apt-mirror.sh,target=/tmp/apt-mirror.sh sh /tmp/apt-mirror.sh restore

RUN agentctl --version && agent-image-check

USER agent

# The minimal image plus Chromium and a graphical desktop.
FROM minimal AS desktop

USER root

# The same mirror as in minimal (see there).
ARG APT_MIRROR=
RUN --mount=type=bind,source=common/apt-mirror.sh,target=/tmp/apt-mirror.sh sh /tmp/apt-mirror.sh use "${APT_MIRROR}"

RUN agent-feature install desktop

# Back to Ubuntu's own sources, so the image does not depend on the build's mirror.
RUN --mount=type=bind,source=common/apt-mirror.sh,target=/tmp/apt-mirror.sh sh /tmp/apt-mirror.sh restore

# What `agent-feature env desktop` prints.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
ENV DISPLAY=:1
ENV DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
ENV ACCESSIBILITY_ENABLED=1
ENV PLAYWRIGHT_MCP_EXECUTABLE_PATH=/usr/local/libexec/agent-playwright-chromium
ENV XDG_CURRENT_DESKTOP=X-Openbox:XFCE

RUN agent-image-check

USER agent
