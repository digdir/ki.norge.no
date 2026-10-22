# Link statistics

How often the links in the menu, the mobile menu, the logo and the footer are used. Why it is built this way, and why it needs no consent: [ADR](adr/2026-10-22-link-statistics.md).

## How it works

- `withOrigin()` in `apps/frontend/src/lib/link-origin.ts` adds `?fra=<label>` to internal links when the page is rendered. The labels are `meny`, `meny-mobil`, `logo` and `bunntekst`.
- The cache worker removes the label before the cache and the frontend see the address, and adds 1 to `link_counts` for the day, the label and the page (`apps/cache-kinorgeportal/src/link-counts.ts`).
- A script in `Layout.astro` removes the label from the address bar after the page has loaded.

Without the D1 binding the worker still removes the label, but counts nothing.

## Setting it up

Once per environment. This creates live infrastructure, so it is done by someone with access to the Cloudflare account.

```bash
cd apps/cache-kinorgeportal
pnpm exec wrangler d1 create ki-norge-link-counts-prod
pnpm exec wrangler d1 create ki-norge-link-counts-tt02
```

Add the binding under each environment in `wrangler.jsonc`, with the id the command printed:

```jsonc
"d1_databases": [
  { "binding": "LINK_COUNTS", "database_name": "ki-norge-link-counts-prod", "database_id": "<id>", "migrations_dir": "migrations" }
]
```

Create the table, then deploy the worker:

```bash
pnpm exec wrangler d1 migrations apply ki-norge-link-counts-prod --remote --env prod
pnpm run cache-kinorgeportal:deploy:prod
```

## Reading the numbers

```bash
cd apps/cache-kinorgeportal
pnpm exec wrangler d1 execute ki-norge-link-counts-prod --remote --env prod --command \
  "SELECT origin, path, SUM(count) AS uses FROM link_counts WHERE day >= '2026-11-01' GROUP BY origin, path ORDER BY uses DESC"
```

## Adding a label

1. Add it to `LINK_ORIGINS` in `apps/frontend/src/lib/link-origin.ts` and to `KNOWN_ORIGINS` in `apps/cache-kinorgeportal/src/link-counts.ts`. The cache worker's tests fail if the two lists differ.
2. Wrap the links with `withOrigin(href, '<label>')`. Use lowercase letters, digits and hyphens. The label is visible in the address bar until the page has loaded, so it is Norwegian.
3. Deploy the cache worker before the frontend, otherwise the new label is removed from the address but not counted.

The helper works the same in Astro components and in React islands, as long as the island renders the link itself. The header is an island and uses it that way. Adding labels to the HTML after rendering would not work for islands, because the browser would then disagree with the server about the address.
