# Smoke tests

Two layers of tests that check that the site and the CMS respond. Both run in CI.

## 1. `scripts/smoke-test.sh`

Bash and curl, done in about ten seconds. Fetches all public pages and the most important calls to the Delivery API, and fails on anything that is not 2xx or has an empty body. Catches 4xx and 5xx errors, missing pages, broken filters and sorting in the Delivery API, and blocks that have fallen to "Unsupported".

```bash
bash scripts/smoke-test.sh           # prod (default)
bash scripts/smoke-test.sh --tt02    # tt02, requires Altinn VPN. Run it after a mirroring
bash scripts/smoke-test.sh --local   # localhost:4321 and localhost:5000
```

`--local` requires content in the local CMS. Against an empty local CMS it fails.

**In CI:** the job "Smoke test prod" runs `bash scripts/smoke-test.sh --prod` on every push to `main`, not on PRs.

## 2. Playwright

Browser tests for what curl does not see. The setup is in `tests/playwright.config.ts`, with the projects `frontend` (`tests/frontend/`) and `cms` (`tests/cms/`). `TARGET=local` tests against localhost, otherwise against prod. The CMS login uses `CMS_USER` and `CMS_PASS`, and falls back to the local admin account.

**In CI:** the job "Playwright smoke (frontend + CMS auth)" runs on every PR and push. It starts a local CMS with `dotnet run` and the frontend with `pnpm run dev`, and runs two specs from `apps/frontend`:

```bash
cd apps/frontend
TARGET=local npx playwright test --config=../../tests/playwright.config.ts --project=frontend tests/frontend/smoke.spec.ts
TARGET=local npx playwright test --config=../../tests/playwright.config.ts --project=cms tests/cms/auth-and-tree.spec.ts
```

- `smoke.spec.ts` checks that the public pages load, and that the detail pages for the first article and the first example render.
- `auth-and-tree.spec.ts` logs in to the backoffice, checks the structure of the content tree and queries the diagnostics endpoint.

The local CMS in CI starts without uSync import and without content. The tests therefore run against the schema `ContentTypeComposer` creates, not against prod's. See [cms-composers.md](cms-composers.md).

The same commands run locally, with the CMS and frontend up on 5000 and 4321.
