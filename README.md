# KI Norge Portal

Portal for kunstig intelligens i norsk offentlig sektor.

- **Live**: https://ki.norge.no
- **CMS**: https://cms.ki.norge.no/umbraco
- **Repo**: https://github.com/digdir/ki.norge.no
- **Project board**: https://github.com/orgs/digdir/projects/58

## Tech Stack

### CMS
- **Umbraco 17.3.5** (current LTS line) — headless CMS, .NET 10
- **Content Delivery API v2** for frontend consumption
- **Azure SQL** in prod (via dis-core); **SQLite** for local dev
- Auto-bootstrap via `ContentTypeComposer` + `ContentSeeder` on first run

### Frontend
- **Astro 5** SSR on Cloudflare Workers (Node adapter for local dev)
- **React 19** for islands (search dialog, etc.)
- **`@digdir/designsystemet-react`** + **`@digdir/designsystemet-css`** design tokens
- **`@navikt/aksel-icons`** (extracted to static SVG map for Astro compatibility)

### Hosting
- **Frontend:** Cloudflare Workers (`ki-norge-frontend-prod` / `-tt02`)
- **CMS:** Altinn dis-core (Kubernetes), database Azure SQL
- Legacy Azure Container Apps (resource group `ki-norge`, registry `kinorgeacr.azurecr.io`, storage `kinorgestorage`) is retired, kept for reference

### Testing
- **`scripts/smoke-test.sh`** — bash + curl smoke check (~10s, 21 checks). Run after every deploy.
- **Playwright** in `tests/` — frontend smoke + CMS auth/tree state. See `tests/README.md`.

### Testing
- **Playwright 1.44** — E2E tests (functional, visual regression, accessibility)
- **axe-core** — WCAG accessibility checks

## Project Structure

```
ki.norge.no/
├── apps/
│   ├── cms-umbraco/              # Umbraco 17 LTS CMS
│   │   ├── Composers/            # Auto-setup: content types, seeder, preview
│   │   ├── Views/                # Razor view for preview redirect
│   │   ├── appsettings.json      # Production config
│   │   └── Program.cs            # .NET entry point
│   └── frontend/                 # Astro frontend
│       ├── src/
│       │   ├── components/       # Astro/React components
│       │   ├── pages/            # Routes
│       │   ├── lib/umbraco.ts    # Umbraco API client
│       │   └── styles/           # Global CSS + DS tokens
│       ├── tests/                # Playwright E2E tests
│       └── public/               # Static assets
├── design/                       # Stitch design sketches (reference)
├── docs/                         # Technical documentation
└── dokumentasjon/                # Project planning (Norwegian)
```

## Development

### Prerequisites
- .NET 10 SDK (for CMS)
- Node 20+ and pnpm (for frontend)

### Quick start

```bash
# Frontend (Astro, runs on Node locally)
pnpm run frontend:dev         # http://localhost:4321

# CMS (Umbraco 17 / .NET 10)
pnpm run cms:dev              # http://localhost:5000/umbraco
                              # admin@ki.norge.no / KiNorge2025!

# Frontend pointing at prod CMS (no local CMS needed)
pnpm run frontend:dev:prod
```

### Deploy frontend

```bash
# Cloudflare tt02
pnpm run frontend:deploy:tt02

# Cloudflare prod
pnpm run frontend:deploy:prod
```

On first CMS run, the SQLite database is created, `ContentTypeComposer` creates
all content types, and `ContentSeeder` populates demo content. Admin user is
created via unattended install env vars.

**Terminal 2 — Frontend (Astro/Node + pnpm):**
```bash
cd apps/frontend
pnpm install
pnpm run dev
```
- Frontend: http://localhost:4321

### Rendering Strategy

The frontend uses **hybrid rendering**:

- **SSG (prerendered at build)** — all content pages. Content is fetched from Umbraco at build time.
- **SSR (server-rendered)** — `/sok` (search) and `/api/preview` (preview mode endpoints).

In development, the Astro dev server re-fetches from Umbraco on each page load, so CMS changes appear on refresh.

In production, run `pnpm run build` to rebuild with latest content. Consider webhook-triggered rebuilds when CMS content changes.

## Content Types

| Type | Content Type Alias | Description |
|------|-------------------|-------------|
| Artikkel | `artikkel` | News articles |
| Side | `side` | Static pages (om-oss, kontakt, sandkasse) |
| Eksempel | `eksempel` | AI case studies |
| Veiledning | `veiledning` | Guidance documents |
| FAQ | `faq` | Frequently asked questions |
| Merkelapp | `merkelapp` | Tags/categories |

Content is fetched via the Umbraco Content Delivery API v2 at `/umbraco/delivery/api/v2/content`.

## Content Architecture

| Page | CMS-controlled | Code-controlled |
|------|---------------|-----------------|
| `/` (homepage) | Articles (News), Veiledninger (Resources) | Layout, Hero, Pillars, TargetAudiences |
| `/artikler` | Article list + category filtering | Page layout, filter pills |
| `/artikler/[slug]` | Article content (rich text blocks) | Page template, TOC |
| `/eksempler` | Example list, status, tools | Page layout, status badges, filters |
| `/eksempler/[slug]` | Example content, metadata | Page template, related cases |
| `/eksempler/send-inn` | — | Entire page (submission form) |
| `/veiledning` | Veiledning list, categories | Page layout, category icons |
| `/veiledning/[slug]` | Veiledning content (blocks) | Page template |
| `/faq` | FAQ items, categories | Page layout, accordion, filter pills |
| `/kontakt` | Page content (blocks) | Page template |
| `/om-oss` | Page content (blocks) | Partner cards, offerings grid |
| `/sandkasse` | Optional page content | Feature cards, process steps |
| `/sok` | Search results (SSR) | Search UI |
| `/404` | — | Entire page |

**Principle:** Editorial content lives in the CMS. Page structure, navigation, and design live in code.

## Environment Variables

### CMS (`apps/cms-umbraco/appsettings.Development.json`)

Copy from `appsettings.Development.json.example` and fill in:

| Key | Description |
|-----|-------------|
| `Umbraco:CMS:DeliveryApi:ApiKey` | Random key for authenticated API access (preview/draft content) |
| `HeadlessPreview:FrontendUrl` | Frontend URL, default `http://localhost:4321` |
| `HeadlessPreview:PreviewSecret` | Shared secret for preview mode (must match frontend) |

### Frontend (`apps/frontend/.env`)

Copy from `.env.example` and fill in:

| Key | Description |
|-----|-------------|
| `UMBRACO_URL` | CMS URL, default `http://localhost:5000` |
| `UMBRACO_API_KEY` | Must match `Umbraco:CMS:DeliveryApi:ApiKey` in CMS config |
| `SITE_URL` | Frontend URL, default `http://localhost:4321` |
| `PREVIEW_SECRET` | Must match `HeadlessPreview:PreviewSecret` in CMS config |

## Preview Mode

Editors can preview draft content before publishing:

1. In Umbraco admin, click "Save and Preview" on any content item
2. Umbraco redirects to the Astro frontend via `/api/preview`
3. A preview banner appears showing draft content
4. Click "Avslutt forhåndsvisning" to exit preview mode

The preview flow: Umbraco → Razor template redirect → `/api/preview?secret=...&type=...&id=...` → sets cookie → renders page with draft content from Delivery API.

## Testing

```bash
cd apps/frontend

# Run all tests (starts dev server automatically)
pnpm run test:e2e

# Update visual regression snapshots
pnpm run test:e2e:update

# Run tests with UI
pnpm run test:e2e:ui
```

81 tests across 6 browser configurations (Chrome, Firefox, Safari, Chrome Dark, Mobile Chrome, Mobile Safari).
