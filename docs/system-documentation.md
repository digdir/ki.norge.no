# KI Norge system documentation

This page summarises development and setup for ki.norge.no. The document is aimed at developers and other technical staff.

Related documents: [How to release new versions (deploy)](deploy.md). The incident response runbook is held by the project manager.

Contents:

- [Cloudflare](#cloudflare)
  - [Domain names and DNS](#domain-names-and-dns)
  - [SSL termination and certificates](#ssl-termination-and-certificates)
  - [Security rules](#security-rules)
  - [Page engine (portal / frontend)](#page-engine-portal--frontend)
  - [Caching](#caching)
  - [Entry to the editor interface](#entry-to-the-editor-interface)
  - [Launch and gating](#launch-and-gating)
- [Altinn dis-core](#altinn-dis-core)
  - [Umbraco CMS](#umbraco-cms)
  - [Schema and uSync](#schema-and-usync)
  - [AzureSQL](#azuresql)
  - [Media files](#media-files)
- [ElasticSearch](#elasticsearch)
- [Health check](#health-check)
- [Environments at a glance](#environments-at-a-glance)

## Cloudflare

### Domain names and DNS

ki.norge.no sits under norge.no in Cloudflare as "Partial Setup (CNAME Setup)". This means DNS records are managed by the norge.no owner as before, not through Cloudflare, and that selected subdomains point to Cloudflare with CNAME.

Partial setup is not a choice we made out of caution, but the only option: Cloudflare requires an apex domain to create a new zone on Free, Pro and Business. We do not own the apex domain norge.no, so full setup is not possible for us.

Hostnames in use:

| Hostname | Points to |
| --- | --- |
| `ki.norge.no` | frontend prod |
| `ki.test.norge.no` | frontend tt02 |
| `cms.ki.norge.no` | Umbraco prod |
| `cms.ki.test.norge.no` | Umbraco tt02 |

DNS changes on norge.no are ordered from drift@digdir.no, who also own the domain.

### SSL termination and certificates

The portal addresses are set up as "custom hostnames" in Cloudflare with the certificate "provided by Cloudflare". They are issued by Google Trust Services and renewed automatically.

The hostnames are bound to workers, and SSL termination happens before the request reaches the worker.

### Security rules

Cloudflare provides automatic DDoS protection. Security headers (CSP, HSTS and the rest) are set by the frontend itself in `apps/frontend/src/middleware.ts`, not in Cloudflare.

Two rate limits are configured in `wrangler.jsonc`:

- `TILTAK_LIMIT`: 5 requests per 60 seconds
- `SEARCH_LIMIT`: 60 requests per 60 seconds

### Page engine (portal / frontend)

The page engine is an Astro application in SSR mode that runs as a worker in Cloudflare. It fetches data from:

- Umbraco Delivery API v2 (content)
- ElasticSearch (search)

Code: `apps/frontend` in [digdir/ki.norge.no](https://github.com/digdir/ki.norge.no).

Running workers: `ki-norge-frontend-prod` and `ki-norge-frontend-tt02`.

All data fetching lives in `src/lib/umbraco.ts`. That is also where `mapItem()` lives, which maps content types from the API to TypeScript types. If you want to understand where a value on a page comes from, start there.

### Caching

Assets (CSS, JS, images) are uploaded to Cloudflare on deploy. Cloudflare also automatically caches static files fetched from Umbraco.

For caching whole pages, a separate small worker runs in front of the page engine, `cache-kinorgeportal`. It has a service binding `FRONTEND` to `ki-norge-frontend-<environment>`, looks up the address in the cache, and calls the page engine only when the page is not there. A new page is put in the cache before it is delivered.

Code: `apps/cache-kinorgeportal`. Workers: `cache-kinorgeportal-prod` and `cache-kinorgeportal-tt02`.

The cache is purged in two places:

- **On publish in Umbraco.** The CMS calls Cloudflare's REST API when the editor publishes.
- **On deploy.** The deploy script purges by itself. Without that, edge-cached HTML can point to an `_astro` hash that no longer exists, and the page renders unstyled.

### Entry to the editor interface

Umbraco is made publicly available through a separate worker, `cms-kinorgeportal`, instead of directly. This gives DDoS protection, and makes the Delivery API reachable for our workers without being open on the Internet.

Code: `apps/cms-kinorgeportal`. Workers: `cms-kinorgeportal-prod` and `cms-kinorgeportal-tt02`.

`workers_dev` **must** be `true` for this worker. The workers.dev hostnames carry prod media, and when they were turned off the images dropped out for ten minutes.

### Crawling

`robots.txt` returns `Disallow: /` for everything not in `PROD_HOSTS`.

## Altinn dis-core

### Umbraco CMS

As the publishing solution we use Umbraco CMS (version 17, .NET 10).

Code: `apps/cms-umbraco` in [digdir/ki.norge.no](https://github.com/digdir/ki.norge.no).

Umbraco is deployed as a Docker image to the Kubernetes cluster "dis-core", which Altinn's platform team makes available to us on Microsoft Azure. The namespace is `product-kinorgeportal`. Rollout happens with Flux from an OCI artifact, not directly from GitHub Actions.

Umbraco in prod answers on three hostnames, set in `syncroot/prod/kustomization.yaml`:

- `kinorgeportal.prod.dis-core.altinn.cloud`
- `cms.ki.norge.no`
- `cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev`

`cms.ki.norge.no` is Umbraco's `UmbracoApplicationUrl` and `BackOfficeHost`, so the OAuth return lands there.

Login to the backoffice goes through Entra ID. New users are added with `pnpm run cms:add-user`.

The CMS composers, what they do and which config turns them on in prod and tt02, are described in [cms-composers.md](cms-composers.md).

**kubectl and dis-core hostnames require the Altinn VPN.** Without the VPN you reach the Delivery API through the workers.dev proxy, but not the cluster.

### Schema and uSync

This is the single most important detail in the CMS setup.

The schema in production is owned by uSync, not by code. Both `syncroot/prod` and `syncroot/tt02` set `USYNC_OWNS_SCHEMA=true`, and then `ContentTypeComposer` skips all of its schema asserting. The composer still runs locally, where the env var is missing.

The consequence is an easy trap: a new field added in the composer is green locally and green in CI, and never shows up in prod.

A new field is therefore added by editing the `.config` file under `apps/cms-umbraco/uSync/v17/ContentTypes/` in git. Two rules apply:

- The properties must be **sorted alphabetically by Alias**.
- The file name is never the alias. File names are lowercase, aliases camelCase (`forsideartikkelkort.config` contains the alias `forsideArtikkelKort`, with a capital K).

**Do not regenerate `apps/cms-umbraco/uSync/`.** The files there are prod's schema and are imported on every startup. uSync re-keys on import, and the content types have random GUIDs per database. An export taken from a local machine or tt02 gives the prod types new keys and makes all block content "Unsupported". `SchemaRekeyGuard` aborts such an import, but it is a safeguard, not a permission.

After a schema change you should measure that the content is intact, not assume it. Count blocks, content types and "Unsupported" before and after against the Delivery API:

```
https://cms.ki.norge.no/umbraco/delivery/api/v2/content?take=200&expand=properties%5B%24all%5D
```

If the numbers are the same before and after, nothing was re-keyed.

So the schema belongs in the uSync files. **Content nodes must never be written from startup code.** That has caused three prod incidents. `ContentSeeder` has therefore been removed entirely, and demo and test content is created by an editor.

### AzureSQL

We use managed AzureSQL. It replaced SQLite with Litestream, which caused lock contention when several editors worked at the same time.

Local development still uses SQLite. The local connection string must use `|DataDirectory|` in the path, not a relative path, otherwise Umbraco does not find the database. In `appsettings.json` the connection string must be empty, so that the env var overrides it.

Umbraco supports only SQLite and SQL Server. Not PostgreSQL.

### Media files

Media lives in Azure Blob Storage.

Until September 2026 media was served from an Azure Files PVC mounted at `/app/wwwroot/media`. Blob was configured correctly the whole time, but ASP.NET static files served the frozen PVC copy before the blob provider got a chance. The mount has been removed in `syncroot/base/umbraco/deployment.yaml`. The volume declaration remains so the PVC stays bound.

If you want to know which source actually serves a file, look at `last-modified` in the response. The byte size is no good, because the two copies can be bit-identical.

## ElasticSearch

We use Elastic Cloud via Microsoft Azure. The index is called `ki-content`.

**Prod and tt02 share the same cluster and index**, and it holds prod content. This is a deliberate choice, not a misconfiguration, but it is worth knowing: a reindex affects both environments.

`ES_API_KEY` is set as a worker secret, not in `wrangler.jsonc`:

```
wrangler secret put ES_API_KEY --env prod
```

## Health check

`https://ki.norge.no/health` is the endpoint the on-call watch should monitor. The format is the same as `https://info.altinn.no/health`, so one rule on the `status` field covers both portals.

| `status` | HTTP | Means |
| --- | --- | --- |
| `Healthy` | 200 | Everything up |
| `Degraded` | 200 | Search, the CMS proxy or the backoffice is down, pages still render |
| `Unhealthy` | 503 | The CMS does not respond, or responds without content |

Four checks sit behind it, the same in prod and tt02, so one rule in the watch covers both environments:

- **`umbraco`** calls the Delivery API the way the pages do. It is also counted as down when the API responds 200 with an empty list, because that is what it looks like when an upgrade skips the migrations. It is the only one that gives `Unhealthy`.
- **`cms-proxy`** calls the Delivery API through the public CMS address the browser fetches images from, in prod a proxy worker. It catches the proxy being down, as in #600, where the site was without images while everything else responded. It does not fetch any image file, so it does not see a fault in the image storage itself. On tt02 the public address is the same as the internal one, and the check then goes the same way as the browser there.
- **`backoffice`** calls `/umbraco/management/api/v1/server/status`, which is open without login. It is green only when Umbraco responds `Run`, meaning it is not waiting for install or upgrade. The site works without the backoffice, so a fault here gives `Degraded`.
- **`elasticsearch`** runs an empty search with the same key search uses. If the key is missing, it gives `Degraded` without calling anything, because search then falls back to Umbraco's simple search.

The response shows only status and time, never addresses or error messages.

The result is reused for 15 seconds. When it expires, one request refreshes it while the others get the previous result, so there is one round of calls to the CMS and search per 15 seconds per isolate, no matter how many ask. The exception is a new isolate that does not yet have a result to show.

`/api/health` and `/api/health/ready` are older addresses that respond the same as `/health`, with the same result.

## Environments at a glance

| | prod | tt02 |
| --- | --- | --- |
| Frontend | `ki-norge-frontend-prod` | `ki-norge-frontend-tt02` |
| Cache worker | `cache-kinorgeportal-prod` | `cache-kinorgeportal-tt02` |
| CMS worker | `cms-kinorgeportal-prod` | `cms-kinorgeportal-tt02` |
| Portal | ki.norge.no | ki.test.norge.no |
| Umbraco | cms.ki.norge.no | cms.ki.test.norge.no |
| Database | AzureSQL | AzureSQL |
| Kubernetes | `dis-core-prod-aks` | `dis-core-tt02-aks` |

Schema is mirrored automatically to both environments through uSync. **Content is not mirrored.** Copying content from prod to tt02 is a manual one-way job.
