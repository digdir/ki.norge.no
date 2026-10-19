# Mock CMS for local frontend development

Lets the frontend run without a real CMS. A small Node server mirrors the Umbraco
Delivery API v2 content endpoint from a captured fixture, so that pages
render with realistic content. Development only.

## Usage

From the repo root:

```bash
pnpm run frontend:dev:mock
pnpm run frontend:dev:mock --port 4324   # flags are passed on to astro dev
```

Starts the mock CMS (port 5050, `MOCK_PORT` for another) and the Astro dev server against
it in the same command. Ctrl-C, or `pnpm exec astro dev stop` in
`apps/frontend`, stops both. The mock port cannot be 5060 or 5061, they
are blocked by fetch. Requires `pnpm install` in `apps/frontend` first.

Only the mock server on its own: `npm run mock-cms`.

## What the mock supports

All Delivery API calls in `umbraco.ts` go to one endpoint
(`/umbraco/delivery/api/v2/content`) with `filter=contentType:X`, `sort`,
`take` and `skip`. The mock server implements exactly these over the fixture.

## Updating the fixture

The fixture (`delivery-content.json`) is a snapshot of the Delivery API. It was
captured from a local CMS instance with demo content. `ContentSeeder`, which created that
content, has been removed, so a new local CMS is empty. If the fixture is to be captured again,
it has to be done from a CMS that has content:

```bash
curl -s "http://localhost:5000/umbraco/delivery/api/v2/content?take=200" \
  > apps/frontend/tools/mock-cms/delivery-content.json
```
