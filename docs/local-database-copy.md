# Local copy of the prod or tt02 database

Run the CMS on your own machine against a copy of the prod or tt02 database, for debugging and development. The scripts live in `scripts/db/` and are ported from the same tooling in info.altinn.no.

```bash
scripts/db/refresh-local-db.sh prod     # or tt02
pnpm run cms:dev:db-copy
```

Log in at https://localhost:44391/umbraco as the local admin from `CLAUDE.md`.

Copying prod into tt02 is not covered here. See [content-mirroring-tt02.md](content-mirroring-tt02.md).

## Access

- The Altinn VPN. The database is a Private Link address and only resolves over it.
- `kubectl` access to `dis-core-prod-aks` or `dis-core-tt02-aks`, the same as `scripts/backup-prod.sh`. Used read-only to find the database host.
- Entra access to the Azure SQL database for the environment. The database is owned by Altinn dis-core, ask Team Plattform if you lack it.

## Tools

```bash
dotnet tool install -g microsoft.sqlpackage   # ~/.dotnet/tools must be on PATH
az login                                      # token for the database
```

- Docker or podman
- `sqlcmd` (go-sqlcmd or mssql-tools18)
- `python3`, used to hash the local admin password
- Windows: run the scripts in WSL2, with the repo on the Linux file system
- Apple Silicon: SQL Server needs Rosetta, use Colima with `--vm-type=vz --vz-rosetta`

## What the script does

1. Finds the Azure SQL host in the running Umbraco deployment, and uses its `privatelink` name. Set `KINORGE_SQL_HOST` to skip the lookup.
2. Exports the `umbraco` database to `.bacpacs/<env>-umbraco-<time>.bacpac`. For prod you must type `prod` to continue.
3. Starts a SQL Server container (`kinorge-mssql`) on 127.0.0.1. Port 1433, or the next free port if 1433 is taken, for example by the info.altinn.no container.
4. Imports the bacpac and checks row count and constraints.
5. Creates or resets the local admin in the copy. Editors log in with Entra ID, which is off locally, so without this nobody can log in.
6. Writes the connection string to `apps/cms-umbraco/appsettings.Local.json`. `Program.cs` loads that file in Development only.

Useful flags

| Flag | Effect |
| --- | --- |
| `--skip-export` | reuse the newest `.bacpac` for the environment |
| `--keep-container` | import into the running container |
| `--port N` | use exactly this port, fail if it is taken |
| `--off` | delete `appsettings.Local.json`, the CMS uses SQLite again |

Each step also runs on its own: `export-bacpac.sh`, `start-sqlserver.sh`, `import-bacpac.sh`, `set-local-admin.sh`. Pass `--help`.

## Running the CMS against the copy

Use `pnpm run cms:dev:db-copy`, not `cms:dev`. It sets `USYNC_OWNS_SCHEMA=true` as prod and tt02 do, so `ContentTypeComposer` does not change the schema in the copy. The plain equivalent is `USYNC_OWNS_SCHEMA=true dotnet run` in `apps/cms-umbraco`.

While `appsettings.Local.json` exists, every local start uses the copy. Run `refresh-local-db.sh --off` to go back to SQLite.

What to expect

- Images do not load. Media lives in Azure Blob, not in the database.
- On first start Umbraco removes the Entra login links from the copy, since Entra is not configured locally. Only the local copy is affected.
- If the local code is a newer Umbraco version than the environment, the copy is upgraded on start (`UpgradeUnattended`).
- Do not export uSync from the local backoffice and commit it. See `apps/cms-umbraco/uSync/README.md`.
- An export run locally re-stamps `apps/cms-umbraco/uSync/v17/.origin` as `local`, and CI rejects that. Restore it with `git checkout -- apps/cms-umbraco/uSync/v17/.origin`.

## Safety

- Nothing is written to prod or tt02. The remote steps are a `kubectl get`, a TCP check and `sqlpackage /Action:Export`.
- Import and the admin reset refuse any target that is not 127.0.0.1 or localhost.
- The export uses `TrustServerCertificate=True`, because the server certificate does not match the `privatelink` name. The connection is still encrypted.

## Handling the data

A prod copy holds real editor accounts and personal data.

- Keep it on an encrypted disk.
- Delete the `.bacpac` files and the container (`docker rm -f kinorge-mssql`, `docker volume rm kinorge-mssql-data`) when you are done.
- Do not share it. `.bacpacs/`, `*.bacpac`, `appsettings.Local.json` and `scripts/db/.env` are git-ignored.

## If something fails

| Symptom | Cause |
| --- | --- |
| `cannot resolve <host>` | Not on the VPN |
| `cannot read the Umbraco deployment` | No kubectl access, or the VPN exit node is off |
| `Login failed for user '<token-identified principal>'` | No Entra access to the database |
| `SQL Server segfaulted on startup (exit 139)` | x86 emulation with qemu, use Colima with Rosetta |
| Import fails on a foreign key | The export caught the database mid-write, export again |
| Local login rejected | Run `scripts/db/set-local-admin.sh` again |

Unit tests for the helpers: `bash scripts/db/tests/test-lib.sh`.
