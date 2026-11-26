---
name: local-umbraco
description: Run the ki.norge.no Umbraco CMS locally on SQLite, with the schema and a backoffice user, and point the Astro frontend at it. Use when a task needs Umbraco running, such as to try a backend change, the Delivery API or the backoffice, without real content.
---

# Run Umbraco locally

`appsettings.Development.json` already sets up a SQLite database and a local admin on first start, as `CLAUDE.md`
says. Two settings more let the backoffice sign in over plain HTTP, on the same port as the `local-prod-db` skill
uses, so the person can open it through `forward.sh`:

```sh
cd /home/agent/code/ki.norge.no
node scripts/sync-content-routes.js
cd apps/cms-umbraco
export ASPNETCORE_ENVIRONMENT=Development \
  Umbraco__CMS__Global__UseHttps=false \
  Umbraco__CMS__Security__BackOfficeHost=http://localhost:43451 \
  HeadlessPreview__FrontendUrl=http://localhost:4331
dotnet run --urls http://localhost:43451 > /tmp/umbraco.log 2>&1 &
```

- The first start installs the database in `umbraco/Data/` and creates the schema from `ContentTypeComposer`, which
  takes about a minute. It is ready when `http://localhost:43451/umbraco` answers 200. Later starts reuse the
  database. Delete `umbraco/Data/Umbraco.sqlite.db*` to start over.
- Without the two settings for HTTP, the backoffice answers `This server only accepts HTTPS requests` and sends the
  browser to `https://localhost:44391`, which serves nothing here.
- The database has the schema but no content. Create the content a task needs in the backoffice, at
  `http://localhost:43451/umbraco`, signed in as `admin@ki.norge.no` with the local password in `CLAUDE.md`. Never
  write content from code. Entra sign-in does not work locally.
- The start re-stamps `uSync/v17/.origin`. Restore it before you commit, as your instructions say.
- Media, search and cache purging reach Azure, Elasticsearch and Cloudflare, which this agent has no access to, so
  expect errors from them in the log.
- Stop it with `kill %1` from the same shell, or by its PID from `ps`. `pkill -f` with a pattern that also matches
  your own command line kills that shell too.
- `stack.sh` from the `local-prod-db` skill uses the same port, so stop one before you start the other.

To have the frontend use it, start it from `apps/frontend` with the address in the environment:

```sh
UMBRACO_URL=http://localhost:43451 pnpm exec astro dev --background --host 127.0.0.1 --port 4331
```

`pnpm exec astro dev logs` shows its log, and `pnpm exec astro dev stop` stops it. Without `UMBRACO_URL` it reads a
CMS on `localhost:5000`.
