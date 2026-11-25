---
name: local-prod-db
description: Run the ki.norge.no Umbraco CMS locally on a copy of the prod or tt02 database, which the person who created you exported on their machine, and point the Astro frontend at it. Use when a task needs real content, such as to reproduce a bug on a page, check how a change renders existing pages, or test the Delivery API against what prod serves.
---

# Run Umbraco on a copy of prod

You cannot export a database yourself: that needs the VPN, `kubectl` access and an Entra grant you have none of. The
person who created you exports it on their machine, and you import the file into SQL Server in a container here.

A copy of prod holds real editor accounts and personal data, not just published content. Use it only for the task,
never copy anything from it into a commit, a pull request, a screenshot or a log you share, and keep the `.bacpac` and
the database out of Git.

## 1. Find the copy

```sh
ls -t /home/agent/code/ki.norge.no/.bacpacs/*-umbraco-*.bacpac
```

Each name starts with its environment, `prod` or `tt02`. Use prod unless the person or the task names tt02. The newest
copy of the environment is used. Its name holds when it was exported, so say how old it is when that matters for the
task. When there is none, or it is too old, ask them to run this on their machine, where `kinorge-fullstack-dev` is
your name:

```sh
scripts/db/export-bacpac.sh prod
ssh agentctl-kinorge-fullstack-dev mkdir -p code/ki.norge.no/.bacpacs
scp .bacpacs/prod-umbraco-<timestamp>.bacpac agentctl-kinorge-fullstack-dev:code/ki.norge.no/.bacpacs/
```

On the `worktree` variant the folder is their checkout's, so a new export shows up here without copying.

## 2. Run the database, Umbraco and the frontend

```sh
/home/agent/code/ki.norge.no/agents/fullstack-dev/scripts/stack.sh up
```

It starts the database, imports the newest copy of prod when there is no database yet, starts Umbraco on
`http://localhost:43451` and the frontend on `http://127.0.0.1:4331` against it, and returns when both answer. Running
it again restarts only what is down. `stack.sh status` shows what runs, and which environment's copy the database
holds. For tt02, or a newer copy, run `stack.sh up --env tt02 --import`, which replaces the database and what was
changed in it. `up --env` without `--import` refuses when the database holds another environment. `stack.sh down`
stops Umbraco and the frontend. Umbraco's log is `/tmp/umbraco.log`, and `pnpm exec astro dev logs` in
`apps/frontend` shows the frontend's.

Start them with it rather than by hand. It:

- imports with `scripts/db/refresh-local-db.sh --skip-export --env-out`, into the container `kinorge-mssql`, and keeps
  the connection string in `~/.config/kinorge-db/umbraco.env`. It never touches `appsettings.Local.json`. The first
  run pulls the SQL Server image, about 1.5 GB, and the import takes a few minutes.
- sets `USYNC_OWNS_SCHEMA=true`, as `pnpm run cms:dev:db-copy` and prod do, so `ContentTypeComposer` leaves the copy's
  schema alone,
- sets what the backoffice sign-in needs over plain HTTP, and binds the frontend where the person's `forward.sh`
  reaches it.

What to expect:

- The import gives the copy a local admin, `admin@ki.norge.no` with the local password in `CLAUDE.md`, so you can
  sign in to the backoffice. Entra sign-in does not work locally.
- When the branch has a newer Umbraco than the environment, the first start upgrades the database. That is expected,
  and only happens here. Import again to get back to the environment's version.
- Images are in Azure Blob, which you cannot reach, so they are missing.
- Search falls back to Umbraco's own, without Elasticsearch. Cache purging reaches Cloudflare, so expect errors from it
  in the log.
- The start re-stamps `uSync/v17/.origin`. Restore it before you commit, as your instructions say.

SQL Server needs about 2 GB of memory on top of Umbraco and the frontend. The `nested` variants, with 3 GiB on
`minimal` and 4 GiB on `desktop`, are too small for it.

SQL Server exists only for amd64. On an arm64 machine, such as a Mac, it runs under emulation in this sandbox, which
it does not survive: `start-sqlserver.sh` stops with exit code 139. Check with `uname -m` first, and when it says
`aarch64`, tell the person that this skill needs an amd64 machine, rather than working around it.

## 3. Clean up

```sh
/home/agent/code/ki.norge.no/agents/fullstack-dev/scripts/stack.sh down --db
```

stops everything and keeps the database. When the task is done and the copy is no longer needed, remove it with
`docker rm -f kinorge-mssql && docker volume rm kinorge-mssql-data`, and delete the `.bacpac` files you were given,
except on the `worktree` variant, where `.bacpacs/` is the person's.
