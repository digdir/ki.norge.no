## This machine

This agent has the .NET 10 SDK, Node.js, pnpm at the version `package.json` pins, and Podman, which the `docker`
and `docker compose` commands run. It also has a graphical desktop and Chromium. Drive them with the `computer-use`
skill, and capture them for pull requests as the `pr-evidence` skill describes.

Chromium trusts the mediated CA a few seconds after boot, once `$XDG_RUNTIME_DIR/chromium-ca-ready` exists. If a
browser reports a certificate error early in a session, wait for that file and reopen the browser.
