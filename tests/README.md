# Smoke tests

Two layers of testing for ki.norge.no.

## 1. Quick HTTP smoke (`scripts/smoke-test.sh`)

Bash + curl. Fast (~10 seconds). Hits every public URL and key Delivery API endpoints, fails on non-2xx or empty body.

```bash
bash scripts/smoke-test.sh             # against prod (default)
bash scripts/smoke-test.sh --local     # against localhost
```

Catches: 4xx/5xx errors, missing pages, broken Delivery API filters, sort-field bugs (`publishedAt:desc`-style mistakes), bad JSON in property values.

## 2. Playwright (`tests/`)

Browser-driven tests for things curl can't see: render correctness, login flow, CMS tree state, CRUD UI flows.

```bash
npm install --save-dev @playwright/test
npx playwright install chromium      # first time only

npx playwright test --config=tests/playwright.config.ts                       # prod
TARGET=local npx playwright test --config=tests/playwright.config.ts          # localhost
npx playwright test --config=tests/playwright.config.ts --project=frontend   # frontend only
npx playwright test --config=tests/playwright.config.ts --project=cms        # CMS only
```

Auth credentials come from env vars `CMS_USER` / `CMS_PASS` (defaults to unattended-install admin).

### What's tested today
- **frontend/smoke.spec.ts** — every public URL returns 200, header renders, sample artikkel + case detail pages render.
- **cms/auth-and-tree.spec.ts** — admin can log in, content tree confirms pr-316 structural changes (no Caser/KI-ordbok/Ikoner residue), /api/diagnostics reports valid state.

### What's missing (TODO)
- Create + edit + publish + delete artikkel via UI
- Same for case
- Move content between containers via UI (reproduce the "Sandkasse can't move into Sider" bug)
- Visual regression for key pages
- A11y checks (axe-core integration)

## CI

Not wired up yet. Suggested order for adding to CI:
1. Run `scripts/smoke-test.sh --prod` after every deploy. Hard fail if anything 5xx.
2. Run Playwright frontend smoke against the staging URL once we have one.
3. Run Playwright CMS tests against staging only (touches state).
