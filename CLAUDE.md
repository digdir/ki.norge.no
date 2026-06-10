# Claude Code — ki.norge.no

Portal for kunstig intelligens i norsk offentlig sektor. Drives av Digitaliseringsdirektoratet.

## Kjøre lokalt

```bash
# Frontend (Astro SSR, Node lokalt / Cloudflare Workers i prod)
pnpm run frontend:dev         # http://localhost:4321

# CMS (Umbraco .NET 10)
pnpm run cms:dev              # http://localhost:5000/umbraco
                              # admin@ki.norge.no / KiNorge2025!

# Frontend mot prod-CMS (trenger ikke lokal CMS)
pnpm run frontend:dev:prod
```

Første gang CMS kjøres opprettes SQLite-databasen og alt innhold seedes automatisk (unattended install).

## Arkitektur

Monorepo med to apper: frontend på Cloudflare Workers, CMS på Altinn dis-core (Kubernetes).

```
apps/frontend/          Astro SSR, Cloudflare Workers, designsystemet-react
apps/cms-umbraco/       Umbraco 17, .NET 10, Azure SQL (prod), SQLite (lokalt)
scripts/deploy-azure.sh Legacy Container Apps-deploy (utgått, beholdt for referanse)
```

Frontend henter innhold via Umbraco Delivery API v2. Prod-databasen er Azure SQL (dis-core); lokalt brukes SQLite.

## Frontend

**Stack:** Astro (server mode) + React (islands) + @digdir/designsystemet-react + @digdir/designsystemet-css

**Sider** (`apps/frontend/src/pages/`)
- Forsiden, artikler, eksempler, veiledning (guide + steg), sandkasse, FAQ, kontakt, om-oss, ki-ordbok, søk, status (admin-only)
- Dynamiske ruter: `artikler/[slug]`, `eksempler/[slug]`, `veiledning/[guide]`, `veiledning/[guide]/[step]`

**Nøkkelfiler**
- `src/lib/umbraco.ts` — all datahenting fra CMS. Interfaces, fetch-funksjoner, mapItem() som mapper content types til TypeScript-typer
- `src/lib/aksel-icons.ts` — statisk SVG-map for Aksel-ikoner (React-only pakke, kan ikke brukes direkte i Astro)
- `src/lib/seo.ts` — JSON-LD structured data
- `src/middleware.ts` — caching, admin-tilgang (ki_admin cookie), kommer-snart-modus, security headers (CSP, HSTS osv.)
- `src/components/shared/ArticleBlocksRenderer.astro` — **eneste** sted artikkelmoduler rendres. Brukt av artikler/[slug], eksempler/[slug], sandkasse/index. CSS i `src/styles/article-blocks.css`. Endre denne én filen → alle sidene oppdateres.
- `src/components/shared/BlocksRenderer.astro` — eldre/enklere blocks renderer (tekst, advarsel, lenkeliste, faqInnhold). Brukes ikke for artikkelmoduler.
- `src/components/shared/AkselIcon.astro` — rendrer Aksel-ikon etter navn
- `src/components/shared/SearchDialog.tsx` — KI-søk dialog (React, client:load)
- `src/components/shared/CookieNotice.astro` — minimal cookie-notice (essential cookies only)
- `src/components/shared/BackToTop.astro` — flytende back-to-top knapp på lange sider
- `src/styles/global.css`, `search-dialog.css`, `layout.css`, `article-blocks.css`

**layout-system:** Se layout.css

**Breakpoints:** 768px og 1024px (grid). Eldre kode bruker også 640px.

**Designsystem:** Bruk designsystemet-tokens (--ds-size-4, --ds-color-text-default osv.) der de finnes. Ingen Tailwind.

## CMS (Umbraco)

**Nøkkelfiler**
- `Composers/ContentTypeComposer.cs` — oppretter alle document types og element types ved oppstart. Registrerer Block List data types.
- `Program.cs` — startup med instance guard (forhindrer dobbel-start som ødelegger SQLite)
- `appsettings.Development.json` — lokal config med connection string, Delivery API key, preview secret
- `appsettings.json` — prod config, tom connection string (overrides fra env vars i Azure)

**Legge til en ny Block List-modul (element type)**
1. I `ContentTypeComposer.cs`: lag en ny metode som oppretter element type med felter
2. Registrer den i `InitializeAsync` og legg den til i riktig Block List data type
3. I `umbraco.ts`: legg til interface, mapping i mapItem() eller mapArtikkelBlocks()
4. I `BlocksRenderer.astro` eller artikkel-siden: legg til rendering for den nye contentType-verdien

**Eksisterende element types for artikler**
- artikkelTekst (RichText)
- artikkelInfoBoks (tittel + RichText)
- artikkelBildeSeksjon (bilde + bildetekst)
- artikkelMorkPanel (skal fjernes)

**Connection string (lokal SQLite):** Må bruke `|DataDirectory|` i path, ikke relativ sti. Ellers finner ikke Umbraco databasen. Prod kjører Azure SQL via dis-core (connection string injiseres fra Key Vault, ikke SQLite).

**RichText toolbar:** Konfigureres programmatisk i ContentTypeComposer (EnsureRichTextHeadings). Har H2, H3, H4.

**Database:** Prod kjører Azure SQL via dis-core, som erstattet SQLite + Litestream (de ga lock-contention på multi-editor-bruk). Lokal dev bruker fortsatt SQLite. Historisk migrasjonsplan: `docs/sql-server-migration-plan.md`.

**Innholdsskriving fra kode = anti-pattern**: Skjema (content types) settes i kode via `ContentTypeComposer`, men content NODES skal ALDRI skrives fra oppstartskode. Det har gitt 3 prod-incidenter (Sandkasse, nesten Caser, og veiledningsduplikat fra dev-seederen). `ContentSeeder` er derfor fjernet helt; demo/test-innhold lages via editor. Se `docs/seeder-content-write-audit.md`.

## Deploy

- **CMS:** dis-core via GitHub Actions («Docker build and publish» + «Publish Syncroot artifacts», miljø tt02/prod).
- **Frontend:** Cloudflare Workers via `pnpm run frontend:deploy:prod` (og `:tt02`).

Legacy Container Apps-deploy (`pnpm run deploy` = `scripts/deploy-azure.sh`, krever Azure PIM via `pnpm run azure:activate` / `az login` / /az-auth-skillen) er utgått, men beholdt for referanse.

**Infrastruktur (gjeldende)**
- Frontend: Cloudflare Workers (`ki-norge-frontend-prod` / `-tt02`)
- CMS: Altinn dis-core (Kubernetes), database Azure SQL
- CMS-prod nås på `kinorgeportal.prod.dis-core.altinn.cloud` (+ offentlig proxy-worker `cms-kinorgeportal-prod...workers.dev`)

**Legacy Azure Container Apps (utgått, beholdt for referanse)**
- Resource group ki-norge, env ki-norge-no-env, apps ki-norge-frontend / ki-norge-cms
- Registry kinorgeacr.azurecr.io, storage kinorgestorage (Litestream-blob + media-share)
- Subscription Altinn-Portaler-Test (fdc58270...), tenant Digitaliseringsdirektoratet ai-dev (cd0026d8...)
- SQLite-persistens via Litestream (v0.3.14) til Azure Blob — erstattet av Azure SQL i dis-core

## Viktige beslutninger

- Media mount path er `/app/wwwroot/media` (ikke `/app/umbraco/Data/Media`)
- Ingen dark mode (bevisst valg)
- Ingen Tailwind
- pere/nb-nn-translation krever `use_fast=True` for tokenizer (tokenizer.json, ikke spiece.model)
- Admin-tilgang via `/admin-tilgang?key=<ADMIN_SECRET>` setter ki_admin cookie (30 dager)
- Kommer-snart-modus aktiveres med `LAUNCH_MODE=coming-soon` env var

## Stilpreferanser (kommentarer, issues, commit-meldinger)

- Norsk bokmål
- Ingen emojier
- Ikke bruk em dash
- Minimalt med kolon
- Konsist, sjekkliste-format
- Se `~/.claude/skills/STYLE.md` for fullstendig stilguide, og gh-project skill for issue-eksempler

## Lenker

- Figma (hovedfil): https://www.figma.com/design/XExt0cORNSEpZFI4rQY8AN/KI-Norge-portal-skisse
- Figma (handlingsmoduler): https://www.figma.com/design/yOf46bRFjXayIgpQLKJi5h/Handlingsmoduler
- Confluence (tekniske oppgaver): https://digdir.atlassian.net/wiki/spaces/BTP/pages/edit-v2/4195352733
- GitHub project (kanban): https://github.com/orgs/digdir/projects/58
- nb-nn-eval (oversettelsesverktøy): https://github.com/larsekhansen/nb-nn-eval
- Designsystemet: https://www.designsystemet.no/komponenter
- Aksel-ikoner: https://aksel.nav.no/ikoner

## Produksjon

- Frontend (prod): https://ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev (Cloudflare Workers)
- CMS (prod): https://kinorgeportal.prod.dis-core.altinn.cloud/umbraco (Altinn dis-core)
- CMS (tt02): https://kinorgeportal.tt02.dis-core.altinn.cloud/umbraco
- Status: /status (krever ki_admin cookie)
- Domene: ki.norge.no (Cloudflare Partial-zone på norge.no, DNS ikke satt opp ennå)

## Teamet

- Sara: redaktør, innholdsansvarlig
- Eira: designer
- Benjamin: KI-søk API
- Pooria: utvikler
- Marie: prosjektleder
- Kenneth Helland: norge.no domeneansvarlig
- drift@digdir.no: DNS-endringer
