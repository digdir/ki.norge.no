
# Cloudflare edge cache purge on publish

Purges the Cloudflare edge for ki.norge.no automatically when an editor publishes,
unpublishes or deletes content, so that changes show up immediately instead of
waiting for the edge TTL (`s-maxage`, 10 min) to expire.

## How it works

- Notification handlers (`CachePurge/EventHandlers/`) catch
  `ContentPublished` / `ContentUnpublished` / `ContentMovedToRecycleBin`.
- `FrontendUrlResolver` maps the content node to the public frontend URLs it
  affects (its own URL from `slug` + listing page + the front page where the content is featured). The frontend
  routes on the `slug` field, not Umbraco's tree URL, hence an explicit type→route table.
- `CachePurgeDispatcher` collects the URLs and purges them **fire-and-forget** (does not block
  the "Lagrer…" spinner). If a purge is lost (pod restart), `s-maxage` covers it within 10 min.
- `CloudflareCachePurgeService` purges **per URL** (`files`), which works on the Business plan.
  Global changes (`globaleInnstillinger` = header/footer) and bulk publishing above
  `AffectedUrlThreshold` escalate to `purge_everything`.

The purge does nothing until `ZoneId`, `ApiToken` and `SiteBaseUrl` are set.

**Purge on publish is running in prod.** Whether it is turned on in tt02 is shown by the startup log there, see "Adding the secrets" below.

## Setup

Config section `Cloudflare` (see `appsettings.json`). Per environment:

| Value | Where | Status |
|-------|------|--------|
| `Cloudflare__SiteBaseUrl` | env var in `syncroot/{prod,tt02}/kustomization.yaml` | set (prod `https://ki.norge.no`, tt02 `https://ki.test.norge.no`) |
| `Cloudflare--ZoneId` | Azure Key Vault (per environment) | set in prod (not secret, but kept in the vault for simplicity) |
| `Cloudflare--ApiToken` | Azure Key Vault (per environment) | set in prod (creating the token requires superadmin on Cloudflare) |

### Creating an API token (Cloudflare)

1. Cloudflare dashboard → top right (profile) → **My Profile → API Tokens → Create Token**.
2. Choose **Create Custom Token**.
3. **Permissions:** `Zone` → `Cache Purge` → `Purge` (only this, least privilege).
4. **Zone Resources:** `Include` → `Specific zone` → `norge.no`.
5. Create → copy the token (shown only once).

### Getting the Zone ID

The `norge.no` zone → **Overview** → right side menu → **Zone ID** (not secret).

### Adding the secrets

For each environment (prod + tt02), put the secrets in the environment's Key Vault:

- `Cloudflare--ApiToken` = the token from the step above
- `Cloudflare--ZoneId` = norge.no Zone ID (same value for prod and tt02)

Redeploy the CMS. Verify in the startup log:
`Cloudflare cache-purge: Enabled=True, ZoneId=<satt>, ApiToken=<satt>, SiteBaseUrl=https://ki.norge.no`.

## Purge on deploy, and why it uses purge_everything

`apps/frontend/scripts/purge-cache.mjs` is a different thing from the purge above. It runs
in `deploy:prod` / `deploy:tt02` and exists because a deploy rotates the content-hashed
`_astro` file names. Meanwhile the edge cache holds HTML from before the deploy, and that
HTML points to files that no longer exist, which gives an unstyled page (#428).

It uses `purge_everything`. That looks crude, and it is a **measured choice**, not
laziness. Two attempts at making it finer have been assessed and rejected. Read this before you
"improve" it.

### The blast radius is only our own environments

The objection to `purge_everything` is that the `norge.no` zone is shared. It has been measured.

The certificate transparency log for `%.norge.no` gives 24 unique hostnames. Lookups on all 24
show that exactly four are CNAMEd to `cdn.cloudflare.net`, meaning proxied in the partial zone:

    ki.norge.no  ki.test.norge.no  cms.ki.norge.no  cms.ki.test.norge.no

The rest point to `lb.digdir.no`, Google, or are NXDOMAIN. `purge_everything` therefore
hits only us. The cost is a cold tt02 cache for a few minutes when prod is deployed.

The method can be verified:

```sh
curl -s "https://crt.sh/?q=%25.norge.no&output=json" \
  | jq -r '.[].name_value' \
  | sed 's/^\*\.//' \
  | tr 'A-Z' 'a-z' \
  | grep -E '(^|\.)norge\.no$' \
  | sort -u
# then, for each: dig +short <host> CNAME | grep cdn.cloudflare.net
```

`sed` removes wildcard SANs (`*.data.norge.no`), which would otherwise end up in the list as
hostnames nobody can look up. `tr` is needed because CT returns mixed case, so `sort -u`
would otherwise give both `norge.no` and `NORGE.NO`. `grep` filters out `datanorge.no`, a
different domain that crt.sh's LIKE pattern picks up.

crt.sh is unstable and regularly responds 404 or 502. An empty result usually means the
service is down, not that the measurement is wrong. Try again later.

CT and lookups are the best check we can do without zone access, and it is strong
because a Cloudflare-proxied hostname gets Universal SSL and thereby ends up in CT. It is
not authoritative: it misses a proxied hostname without a public certificate, and it
is a snapshot. The authoritative list is the DNS tab for the `norge.no` zone in
the Cloudflare dashboard.

Check it again if someone adds a new hostname to the zone. `minid.norge.no` and
`minside.norge.no` exist in the CT log. They are NXDOMAIN today, but the zone is shared with
services where a purge per frontend deploy would not be a shrug.

### Why not purge per URL

The `files` array works on Business, and the CMS purge above already uses it. It is
still wrong here, because **the cache key is the whole URL with query**.

A visitor who arrives at `/artikler/foo?utm_source=nyhetsbrev` creates their own
cache entry. A `files` purge of the canonical URL does not hit it. `purge_everything`
hits it. Switching would therefore have given a partial purge instead of an exhaustive one, and
let exactly the bug we are fixing live on for tagged links from newsletters and
social media.

Coverage is not the problem: `/sitemap.xml` has 74 URLs and covers the routes. The gap is
utm variants.

**The order is therefore:** normalise the cache key in `apps/cache-kinorgeportal` first
(strip `utm_*`, `fbclid`, `gclid` and similar from the key, not from the origin fetch),
and only then does purge per URL become exhaustive. No page varies content on tracking parameters.
The only query parameters the code reads are `preview` (sets `no-store`) and
`redirect` in `/api/exit-preview` (API route, `no-store`). Neither of them is affected by an allowlist that only strips `utm_*`, `fbclid`
and `gclid`, so the normalisation is semantically safe. It would also give a better hit rate on tagged links, which today
get a cold cache per unique variant.

### Parked, not solved

- **Key normalisation** as above. An efficiency improvement, not a bug fix, since
  `purge_everything` already covers the utm gap. Done the next time the cache worker
  is deployed anyway.
- **`headers: request.headers` in cacheKey** is noise. `caches.default` keys on URL, and
  `Vary` on the stored response controls header variance. Same disposition.
- **The credential weakness.** The script hard-fails without `CLOUDFLARE_PURGE_TOKEN`, which only
  exists locally. Nobody can deploy believing the cache was purged, so the failure mode is
  loud. If it starts to hurt, for example when CI deploys, the answer is to let the
  cache worker look up the frontend's actual version (via `CF_VERSION_METADATA` on
  the frontend, exposed on an endpoint) and fold it into the cache key.

### Rejected

Binding `CF_VERSION_METADATA` on the **cache worker** and deploying it together with the frontend.
It gives the cache worker's own version id, meaning a proxy for the frontend's version,
and only works as long as the deploy script forces the two to go together. Any path that
deploys the frontend alone, such as a hotfix, CI or `wrangler rollback`, then serves
old HTML without any signal as to why.
