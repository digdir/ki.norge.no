# Dependencies

Where the dependencies in the repo live, how they are updated, the traps from earlier rounds, and the recipes for updating and verifying. Parts 1 to 5 are permanent. Parts 6 and 7 are a running log, one part per round.

Last reviewed 2026-10-05 (round 2).

## 1. Where the dependencies live

| Area | File | Updated by | Reaches production when |
| --- | --- | --- | --- |
| Frontend (npm) | `apps/frontend/package.json`, `pnpm-lock.yaml` | Renovate, the routine merges | Next `frontend:deploy:tt02` / `:prod` (manual) |
| Root tooling (npm) | `package.json` (wrangler, `@digdir/designsystemet` for tokens, cross-env, `packageManager` = pnpm) | Renovate | Not in production. Wrangler is used on deploy |
| Security floor (npm) | `pnpm-workspace.yaml` under `overrides` | By hand. Renovate does not create major PRs for them | Together with the frontend |
| Cache worker | `apps/cache-kinorgeportal/package.json` | Renovate | Only on manual `cache-kinorgeportal:deploy:tt02` / `:prod` |
| CMS proxy | `apps/cms-kinorgeportal/` (no package.json, uses the root's wrangler) | Nobody | Only on manual `cms-kinorgeportal:deploy:tt02` / `:prod` |
| CMS (NuGet) | `apps/cms-umbraco/KiNorge.Cms.csproj` | Renovate ("nuget non-major"), the routine merges | New CMS image, then "Publish Syncroot artifacts" |
| Base image | `apps/cms-umbraco/Dockerfile` (`dotnet/aspnet` and `dotnet/sdk` 10.0, pinned by digest) | Renovate (digest PR) | New CMS image |
| GitHub Actions | `.github/workflows/*.yml` (pinned by SHA) | Renovate and Dependabot, both (see phase 4) | Immediately on merge |
| Toolchain | Node 24 (`setup-node`), .NET SDK 10.0.x (`setup-dotnet`), `ubuntu-latest` | By hand | Immediately |
| Workers runtime | `compatibility_date` in each `wrangler.jsonc` | By hand | On deploy of that worker |

## 2. How it works today

- **Renovate** uses the shared setup `digdir/renovate-config` (based on `config:recommended`). It runs on Thursdays before 07:00 and requires a version to be three days old. Minor and patch are grouped into one PR per ecosystem ("npm non-major dependencies", "nuget non-major dependencies"). Docker and Actions are pinned by digest. Our own rules are in `renovate.json`. `prHourlyLimit: 0` makes all the PRs in the window be created the same morning. `prConcurrentLimit` (10) still applies. The status of everything is in the Dependency Dashboard (issue #214).
- **pnpm** also requires a version to be 24 hours old (`minimumReleaseAge: 1440` in `pnpm-workspace.yaml`). It blocks hard, not just with a warning.
- **Dependabot** creates security PRs for npm. That is a setting in the repo. `.github/dependabot.yml` was deleted in [#811](https://github.com/digdir/ki.norge.no/pull/811), and Renovate also updates GitHub Actions.
- **The routine** is a launchd job on Lars' Mac (`no.digdir.ki-norge.dep-routine`), which runs morning and afternoon. It merges minor, patch and digest on green CI, and flags major and runtime. The log is in `~/projects/TODO/Avhengigheter-logg.md`. It only runs when the Mac is awake, and waits for the network after wake-up.

None of them do this:

- deploy. Frontend, CMS image and the two small workers must be released by hand
- take major versions
- test an Umbraco or uSync upgrade against a prod-like database
- clean up overrides that are no longer needed
- see vulnerabilities in development dependencies (Trivy skips them, `pnpm audit` does not)
- move `compatibility_date`, Node major, .NET major or the CI runner's OS

## 3. Traps from earlier rounds

- **An Astro major arrives incomplete from the bot.** `astro`, `@astrojs/cloudflare`, `@astrojs/node` and `@astrojs/react` must be moved together, and the Node requirement checked (#618).
- **An Astro patch can raise floors that overrides hide.** 7.2.9 required `sharp ^0.35.4`, and our override would have won silently. `@cloudflare/vite-plugin` checks the wrangler version at build, not at install (#728).
- **pnpm 12 stops on unknown keys in `pnpm-workspace.yaml`** (`ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`), so a typo in a setting now fails instead of being ignored.
- **Overrides are read only from `pnpm-workspace.yaml`, and win silently over every package's version requirement.** Still true in pnpm 12. An override is removed only when the resolved version has been measured before and after (#791 nanoid). Major bumps of overrides are turned off in `renovate.json`.
- **Never `minimumReleaseAgeExclude` to get past the waiting time.** It turns off a guard against supply chain attacks. Wait, or take the previous patch.
- **Microsoft.OpenApi 3 breaks swagger at runtime while CI is green** (#742). The pins on Microsoft.OpenApi and SQLitePCLRaw in the csproj lift transitive packages above Umbraco's own floor and must stay (#791).
- **An Umbraco minor can contain migrations that rewrite content**, like 17.5 which rewrote links in rich text. `UpgradeUnattended=true` is in `appsettings.json` (#595). Without it the Delivery API responds 200 with an empty list.
- **uSync can re-key on import.** Then all block content becomes "Unsupported". `SchemaRekeyGuard` stops the import, but every uSync version must be measured (recipe 5.5). Never regenerate `apps/cms-umbraco/uSync/`.
- **CMS deploy.** Every deploy needs a new image tag (`imagePullPolicy: IfNotPresent`). The deployment is `Recreate` with one pod, which gives about 45 seconds of downtime. A green workflow does not mean the pod has rolled (Flux takes a few minutes).
- **Workers.** `fetch` called as a method (`deps.fetch()`) throws "Illegal invocation". `Date.now()` is 0 in module scope. The cache worker looks up on URL alone.
- **Frontend deploy requires a clean main in sync with origin.** Run from the primary checkout.
- **Never roll the CMS below image 69.** Tags, ingress and virksomhet then disappear with their values (uSync `RemoveProperties`).

## 4. Order and gates

1. **One thing per PR.** Each ecosystem and each major gets its own PR, so an error can be traced and rolled back alone.
2. **Green CI is not enough.** Each PR gets the verification for its area in part 5.
3. **tt02 before prod,** with the same image tag and the same main commit.
4. **Baseline before, measurement after.** Numbers, not impressions.
5. **Stop and ask Lars** about anything listed in part 8.

## 5. Recipes

### 5.1 Before you start

```sh
cd ~/projects/ki.norge.no && git fetch origin && git status --short   # should be empty
git worktree add ../ki-norge-working-trees/<name> -b <branch> origin/main
cd ../ki-norge-working-trees/<name> && pnpm install --frozen-lockfile
```

Branch work is always done in a worktree. The primary checkout is used only for deploy.

Baseline in both environments:

```sh
node scripts/cms-telling.mjs cms.ki.norge.no
node scripts/cms-telling.mjs cms.ki.test.norge.no
pnpm run audit:layout                          # prod, all URLs in the sitemap
curl -s https://ki.norge.no/health             # "status": "Healthy"
```

Status for base image and vulnerabilities:

```sh
node scripts/dotnet-image-versjon.mjs              # .NET in the pinned digest vs. the current tag
trivy fs . --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --skip-dirs .git,node_modules,.playwright-cli
pnpm audit --audit-level high                  # includes development dependencies
dotnet list apps/cms-umbraco package --vulnerable --include-transitive
```

### 5.2 npm in the frontend

```sh
pnpm --filter ki-norge-frontend run test:unit
pnpm --filter ki-norge-frontend run build
pnpm run frontend:dev:prod                     # local frontend against prod CMS on port 4321
pnpm run audit:layout http://localhost:4321    # same check as the baseline, against local
```

- **Designsystemet and aksel-icons** can change CSS. Compare the front page, `/artikler`, `/eksempler`, an example page, `/veiledning`, `/kalender`, `/ki-tiltak` and `/om-oss` at 375, 768 and 1280 before and after, with screenshots, and look at them.
- **The islands** (React) are tested in the browser: search opens and gives hits, a KI-tiltak opens from the list, and the tabs on `/kalender` switch.
- **After deploy to tt02:** `pnpm run audit:layout https://ki.test.norge.no`, and the same islands.
- **Stop the dev server.** Astro 7 starts it detached: `pnpm exec astro dev stop` from `apps/frontend`. Check that the port is free with `lsof -nP -iTCP:4321 -sTCP:LISTEN`, and kill the PID it shows if anything is left.

### 5.3 Cache worker and CMS proxy

```sh
pnpm --filter cache-kinorgeportal exec vitest run          # the tests do not run in CI
pnpm --filter cache-kinorgeportal exec wrangler deploy --env tt02 --dry-run
```

Deploy from the primary checkout on a clean main: `pnpm run cache-kinorgeportal:deploy:tt02` and `pnpm run cms-kinorgeportal:deploy:tt02`, then `:prod`. The scripts do not check that main is clean, so do that first.

Check after deploy:

- **The cache worker does not store no-store.** Measure on the content, not on `Date`. Cloudflare sets a new `Date` also on responses from the Cache API, so equal `Date` proves nothing. Fetch `/health` twice 20 seconds apart: the response should differ, since the durations change. Fetch the front page twice: `news-card-<id>` gets a new random id on every render, so equal ids mean the response came from the cache, and it should.
- **The proxy** responds 302 to `/umbraco` on the root URL, and media files have `Cache-Control` (#686). The tt02 frontend fetches images directly from dis-core and not via the proxy, so on tt02 media must be checked against the proxy host.

### 5.4 NuGet and base image

```sh
pnpm run cms:build                                         # 0 errors, same number of warnings as before
dotnet list apps/cms-umbraco package --outdated
dotnet list apps/cms-umbraco package --vulnerable --include-transitive
```

- **Base image:** `node scripts/dotnet-image-versjon.mjs` shows the .NET version in the pinned digests and in the current tag. It exits with code 1 when they differ. Run it before and after.
- **Swagger:** a change in OpenApi, Swashbuckle or ASP.NET requires the swagger documents to respond 200 at runtime. Note the path here the first time the check is run.

### 5.5 Umbraco and uSync, prod-like test

Applies to all upgrades of `Umbraco.Cms`, `Umbraco.Cms.DevelopmentMode.Backoffice`, `Umbraco.StorageProviders.AzureBlob` and `uSync`, also patch.

1. **Worktree A on main and B on the branch.** Neither of them should have `apps/cms-umbraco/umbraco/Data/Umbraco.sqlite.db` beforehand.
2. **Start A prod-like:**
   ```sh
   node scripts/sync-content-routes.js
   cd apps/cms-umbraco && USYNC_OWNS_SCHEMA=true uSync__Settings__ImportAtStartup=Settings dotnet run
   ```
   Wait until `curl -s http://localhost:5000/umbraco/management/api/v1/server/status` gives `"serverStatus":"Run"`. Then stop, and check that port 5000 is free.
3. **Dump the keys in A:**
   ```sql
   SELECT 'ct', n.uniqueId, ct.alias FROM cmsContentType ct JOIN umbracoNode n ON n.id = ct.nodeId
   UNION ALL SELECT 'dt', n.uniqueId, n.text || ' ' || dt.propertyEditorAlias FROM umbracoDataType dt JOIN umbracoNode n ON n.id = dt.nodeId
   UNION ALL SELECT 'pt', pt.UniqueId, ct.alias || '.' || pt.Alias FROM cmsPropertyType pt JOIN cmsContentType ct ON ct.nodeId = pt.contentTypeId
   ORDER BY 1, 3;
   ```
   Run with `sqlite3 -readonly apps/cms-umbraco/umbraco/Data/Umbraco.sqlite.db "<query>" > a.txt`.
4. **Add test content in A** with some blocks, tags and fields from each content type, and publish. The local throwaway user from CLAUDE.md is fine here, only against localhost. Stop A.
5. **Copy the database from A to B,** same path, with A stopped. Copy `apps/cms-umbraco/wwwroot/media` too, if the test content has images. Start B with the same environment variables.
6. **Check the log in B** (`apps/cms-umbraco/umbraco/Logs/UmbracoTraceLog.*.json`):
   - the line "uSync Import: … changes" has only the changes that were expected
   - no `SchemaRekeyGuard`, and no errors from migrations
   - `serverStatus` is `Run`
7. **Dump the keys in B** to `b.txt`. `diff a.txt b.txt` should be empty, or show only what the PR changes on purpose.
8. **The content from step 4:** the Delivery API on `http://localhost:5000` gives the same values, and no block has `Unsupported`.
9. **Clean up:**
   ```sh
   git checkout -- apps/cms-umbraco/appsettings.json apps/cms-umbraco/appsettings-schema.Umbraco.Cms.json
   ```
   A local run rewrites both. Stop the processes, and check port 5000 with `lsof`.

Major versions of Umbraco additionally follow Umbraco's own upgrade guide for the version.

### 5.6 CMS deploy and measurement

```sh
gh run list --repo digdir/ki.norge.no --workflow publish-syncroot-main.yaml --limit 3   # latest tag, pick the next number
gh workflow run docker-publish.yaml --repo digdir/ki.norge.no --ref main -f tag=<N>-<short-name>
gh workflow run publish-syncroot-main.yaml --repo digdir/ki.norge.no --ref main \
  -f environment=tt02 -f image-tag=<N>-<short-name>
```

- **The pod has rolled** when `Last-Modified` on `https://<cms-host>/App_Plugins/Malform/umbraco-package.json?cb=$RANDOM` changes to the build time. Always use a cache buster.
- **After the rollout:**
  - `node scripts/cms-telling.mjs <cms-host>` gives the same numbers as the baseline
  - `node scripts/cms-telling.mjs <cms-host> --noder` gives the same node list, with `diff` against a file saved before the deploy
  - `/umbraco` responds 200
  - `/health` on the frontend is Healthy
- **Then prod** with the same tag. Editors can end up in a login loop after a restart. A private window or cleared localStorage solves it.

### 5.7 Renovate rules

Changes to `renovate.json` are validated before the PR:

```sh
npx --yes --package renovate@latest renovate-config-validator --no-global --strict renovate.json
```

Each rule has a `description` that says why it exists, and when it can be removed.

### 5.8 Removing an override

1. Note the resolved version: `pnpm why <package> -r`.
2. Remove the line in `pnpm-workspace.yaml`, and run `pnpm install`.
3. `pnpm why <package> -r` again. The resolved version should be at least as high.
4. `pnpm-lock.yaml` should only lose the override line.
5. Trivy should give 0 findings.

Otherwise the override stays, with a comment about why.

## 6. Round 1 (from 2026-09-28)

### Findings

| Finding | Consequence | Action |
| --- | --- | --- |
| The base images are on .NET 10.0.10 (14 July). Today's 10.0 image is 10.0.12 (21 September) | The CMS runtime in prod lacks two monthly security updates | Phase 1 |
| The digest PRs for the base images are in "Pending Status Checks" in the dashboard, and none have been created since July | Confirmed with Renovate locally: "digest update of mcr.microsoft.com/dotnet/sdk has no releaseTimestamp to age against". They never mature | Phases 0 and 1 |
| Thursday 1.10 opens PRs for Umbraco 18, uSync 18, vitest 5, pnpm 12 and @astrojs/react 7 | The routine flags them, but the decision has to be made | Phase 0 |
| `cache-kinorgeportal-tt02` was deployed 11.6 and lacks #542. `cms-kinorgeportal-tt02` was deployed 15.7 and lacks #686 | Barely noticeable. `/health` (no-store) was not cached on tt02 either, measured on the content 28.9 | Phase 1 |
| `pnpm audit`: 2 HIGH (brace-expansion) and 2 moderate (qs), all via `@digdir/designsystemet` (tokens CLI, development only) | Not in the site. Trivy does not see them | Phase 1 |
| #742 (OpenApi 3) is "abandoned" and still open. #795 (TypeScript 7, cache worker only) is flagged every day | Noise in the routine | Phases 0 and 3 |
| GitHub moves `ubuntu-latest` to Ubuntu 26 from 19 October | CI switches OS without a change on our side | Phase 4, before 19.10 |
| `aquasecurity/trivy-action` is pinned to a commit on `master`, not a release | The latest release (v0.36.0, April) is older than the commit we are on (August, Trivy 0.74). Switching to the release is a downgrade, and the SHA pin is immutable anyway | Stays |
| CI runs the unit tests twice ("Unit tests" and "Enhetstester"). The tests for the cache worker do not run in CI | Slower CI, and no coverage of the worker | Phase 4 |
| `minimumReleaseAgeExclude` has nine old entries (astro 6.4.7, designsystemet 1.15.0 and others) | Exceptions from a security guard nobody needs any more | Phase 4 |
| Umbraco minor goes in the group "nuget non-major". The routine has flagged minor of Umbraco.Cms since July, but not patch, uSync or AzureBlob | uSync has re-keyed in a patch before (17.3.6) | Phase 0 |
| NuGet: no known vulnerabilities. Umbraco, uSync and AzureBlob are on the latest 17.x | Good | None |
| Transitive packages are never updated within their version requirements. brace-expansion and qs were on vulnerable versions even though the fixed ones were allowed | Security fixes in transitive packages do not come in by themselves. Renovate does not have "lock file maintenance" turned on | Phase 4 |
| `pnpm run tokens:build` stops on a question about migrating `designsystemet.config.json` to a new colour scheme, and the build gives 9 files that differ from the committed ones | The tokens build cannot be run without answering the question, and the tokens in the repo are not in sync with the generator. Was the case before this round | Separate issue |

### Phase 0: rules and decisions, before Thursday 1.10

- [x] **PR with Renovate rules** (5.7), #809:
  - The Umbraco family and uSync are kept below 18 (`allowedVersions: "<18.0.0"`). Umbraco 17 is LTS, and 18 is taken as a separate, planned upgrade.
  - `dotnet/aspnet` and `dotnet/sdk` are kept on 10 (`allowedVersions: "<11"`). .NET 10 is LTS, and Umbraco 17 builds on it.
  - Digest updates of the base image are created without waiting time (`matchUpdateTypes: ["digest"]`, `minimumReleaseAge: "0 days"`).
  - `vitest` in the cache worker is kept below 5 until `@cloudflare/vitest-pool-workers` supports it (0.22.0 requires `^4.1.0`).
  - Umbraco and uSync get their own group, so minor does not end up in "nuget non-major".
- [x] **The routine** never merges PRs that change Umbraco or uSync (`prompt.md` on Lars' Mac, requires Lars).
- [x] **Close #742** (requires Lars).
- [x] **After Thursday's run:** the digest PRs did not come. See round 2.

### Phase 1: security and operations

- [x] **Base image to 10.0.12** (#810, image `70-dotnet-10-0-12` in tt02 and prod 28.9). A PR that updates both digests if Renovate has not created it. Then `pnpm run cms:build`, CI, new image, tt02, measurement (5.6), and prod.
- [x] **The tt02 workers are synced with main** (5.3). Prod is already updated.
- [x] **The vulnerabilities in the tokens CLI** (#812). Solved without an override: `minimatch` and `url` already allowed the fixed versions, so `pnpm update -r --depth Infinity brace-expansion qs` was enough. The token build gave an identical result with the old and new lockfile (run with `yes n |` to answer no to the migration).

### Phase 2: minor and patch from Thursday

- [x] **npm non-major** (#820): astro 7.3.5, `@astrojs/cloudflare` 14.3.3, wrangler, designsystemet 1.23.0 and aksel-icons 8.17.2. Follow 5.2 with screenshots, since designsystemet and the icons can change the appearance. Check the sharp and wrangler requirements from 3.
- [x] **nuget non-major** (#819): OpenTelemetry 1.19.1 and MailKit 4.18.1. `cms:build`, CI, and out with the next CMS image.

### Phase 3: major, one at a time

- [x] **TypeScript 7 (#795),** merged 28.9, only in the cache worker. Vitest (5.3), `wrangler types` and deploy with `--dry-run`. The frontend does not have TypeScript as its own dependency.
- [x] **@astrojs/react 7** (#813). `oxc-transform-react` is an optional peer, only for React Compiler. Babel is out of the tree, so the overrides for `@babel/core` and `browserslist` have been removed. The client bundles were byte-identical with 6.0.6, measured in prod against tt02.
- [x] **pnpm 12** (#826, round 2). `packageManager` in `package.json`. Read the release notes for the lockfile format and the settings in `pnpm-workspace.yaml` (`overrides`, `minimumReleaseAge`, `allowBuilds`). `pnpm install --frozen-lockfile` must work in CI.
- [x] **vitest 5 in the frontend** (#825, round 2). The cache worker waits, see phase 0.
- [x] **@types/node** follows the runtime: pinned to `^24`, and Renovate keeps it below 25 until Node 26 becomes LTS (#831).
- [ ] **Umbraco 18** is not taken in this round. Decided together with Lars when there is a reason for it, and follows 5.5 in full.

### Phase 4: cleanup and guards

- [x] **CI on `ubuntu-26.04`:** all of CI was green there 28.9, so the move on 19 October requires no change.
- [x] **Remove the double test run** in the frontend job, and add the cache worker's tests to CI.
- [x] **`trivy-action`:** stays, see the findings.
- [x] **One bot for Actions.** Both Renovate (via `config:recommended`) and Dependabot (`.github/dependabot.yml`) update Actions. Keep Renovate, which groups and pins by digest, and remove the version updates in `dependabot.yml`. The security alerts from Dependabot are kept.
- [x] **Clean up `minimumReleaseAgeExclude`.** None of the entries apply to versions we use.
- [ ] **Each override is assessed according to 5.8,** and redundant ones are removed. Done for `@babel/core` and `browserslist` (#813).
- [ ] **Renovate `lockFileMaintenance`** monthly, so transitive packages keep up within the version requirements. One PR a month, verified as in 5.2.
- [ ] **`compatibility_date`** in the three workers is moved deliberately, with a test on tt02.

## 7. Round 2 (from 2026-10-01)

### Findings

| Finding | Consequence | Action |
| --- | --- | --- |
| On Thursday 1.10 Renovate created only #819 and #820. The default limit is 2 PRs per hour, and we have one window a week (before 07:00 Thursday) | vitest 5, pnpm 12, the digests for the base images, uSync 17.4.3, the trivy digest and the cosign pin were left under "Awaiting Schedule" in #214 | `prHourlyLimit: 0` in `renovate.json` |
| The routine failed from 1.10. The network was not up when the Mac woke | The runs from 1.10 failed | The routine now waits for the network |
| pnpm 12 stops on unknown keys in `pnpm-workspace.yaml` when the running version satisfies `packageManager` | A typo now fails instead of being silently ignored. Tried with `minimumReleaseAg`, which gave `ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS` | None. All our keys are recognised |
| Overrides still win silently in pnpm 12 | With `js-yaml` set to `4.1.0`, pnpm 12 locked 4.1.0, even though astro requires `^4.3.2`, without a warning | The rule in 3 applies |
| astro now itself requires `js-yaml ^4.3.2` | The override `^4.3.1` no longer protects against anything | Removed according to 5.8 |

### Done

- [x] **npm non-major** (#820) and **nuget non-major** (#819), verified according to 5.2 and 5.4.
- [x] **vitest 5 in the frontend** (#825), created by hand since the Renovate PR did not come. The cache worker stays on vitest 4.
- [x] **pnpm 12** (#826), created by hand. `pnpm/action-setup` had to go to v6.1.0 to support pnpm 12. The lockfile only got pnpm's own document (`packageManagerDependencies`), no project packages moved. `overrides`, `minimumReleaseAge` and `allowBuilds` have been tried and are read.
- [x] **`prHourlyLimit: 0`** in `renovate.json`.

### Remaining

- [x] **Remove the `js-yaml` override** according to 5.8 (#830). The resolved version is 4.3.2 before and after, and Trivy gives 0 findings.
- [ ] **`compatibility_date`** in the three workers is moved deliberately, with a test on tt02.
- [ ] **Next Thursday:** did all the PRs that were under "Awaiting Schedule" come?

## 8. This requires Lars

- CMS deploy to prod when auto mode stops the command. That has happened.
- Closing PRs, commenting or posting anything on GitHub.
- Changes to the routine on Lars' Mac.
- Major versions of Umbraco or .NET, and anything that changes the CMS schema.
