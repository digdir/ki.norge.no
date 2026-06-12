# KI Norge Portal

Portal for kunstig intelligens i norsk offentlig sektor.

- **Live**: https://ki.norge.no
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
AND
# CMS (Umbraco 17 / .NET 10)
pnpm run cms:dev              # http://localhost:5000/umbraco

OR

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


## Content Types

| Type | Content Type Alias | Description |
|------|-------------------|-------------|
| Artikkel | `artikkel` | News articles |
| Side | `side` | Static pages (om-oss, kontakt, sandkasse) |
| Eksempel | `eksempel` | AI case studies |
| Veiledning | `veiledning` | Guidance documents |

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
| `/404` | — | Entire page |

**Principle:** Editorial content lives in the CMS. Page structure, navigation, and design live in code.

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
