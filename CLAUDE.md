# Claude Code — ki.norge.no

Portal for kunstig intelligens i norsk offentlig sektor. Drives av Digitaliseringsdirektoratet.

## Kjøre lokalt

```bash
# Frontend (Astro SSR på Deno)
npm run frontend:dev          # http://localhost:4321

# CMS (Umbraco .NET 10)
npm run cms:dev               # http://localhost:5000/umbraco
                               # admin@ki.norge.no / KiNorge2025!

# Frontend mot prod-CMS (trenger ikke lokal CMS)
npm run frontend:dev:prod
```

Første gang CMS kjøres opprettes SQLite-databasen og alt innhold seedes automatisk (unattended install).

## Arkitektur

Monorepo med to apper som kjører i separate Azure Container Apps.

```
apps/frontend/          Astro SSR, Deno runtime, designsystemet-react
apps/cms-umbraco/       Umbraco 17, .NET 10, SQLite, Litestream backup
scripts/deploy-azure.sh Deploy til Azure Container Apps
```

Frontend henter innhold via Umbraco Delivery API v2. CMS-databasen replikeres til Azure Blob Storage via Litestream.

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

**Connection string:** Må bruke `|DataDirectory|` i path, ikke relativ sti. Ellers finner ikke Umbraco databasen. På prod: `Default Timeout=30` setter SQLite busy_timeout for å unngå "database is locked"-feil ved samtidige skrivinger.

**RichText toolbar:** Konfigureres programmatisk i ContentTypeComposer (EnsureRichTextHeadings). Har H2, H3, H4.

**Migrasjon til SQL Server planlagt**: SQLite + Litestream gir lock-contention på multi-editor-bruk. Plan i `docs/sql-server-migration-plan.md`. Tester forberedt i `tests/sql-migration/`. Avventer team-go-ahead.

**Innholdsskriving fra kode = anti-pattern**: Skjema (content types) settes i kode via `ContentTypeComposer`, men content NODES skal ALDRI skrives fra oppstartskode. Det har gitt 3 prod-incidenter (Sandkasse, nesten Caser, og veiledningsduplikat fra dev-seederen). `ContentSeeder` er derfor fjernet helt; demo/test-innhold lages via editor. Se `docs/seeder-content-write-audit.md`.

## Deploy

```bash
npm run deploy              # eller: bash scripts/deploy-azure.sh
```

Krever Azure PIM-aktivering først (varer 8 timer):
```bash
npm run azure:activate      # aktiverer Contributor-rolle
az login                    # etter 15 sekunder
```

Eller bruk /az-auth skillen.

**Azure-ressurser**
- Resource group: ki-norge
- Container Apps environment: ki-norge-no-env
- Frontend: ki-norge-frontend (port 4321, max 3 replicas)
- CMS: ki-norge-cms (port 8080, max 1 replica pga SQLite)
- Registry: kinorgeacr.azurecr.io
- Storage: kinorgestorage (blob container umbraco-db for Litestream, file share umbraco-data for media)
- Subscription: Altinn-Portaler-Test (fdc58270...)
- Tenant: Digitaliseringsdirektoratet ai-dev (cd0026d8...)

**Litestream backup**
- v0.3.14 (IKKE v0.5, inkompatibelt backup-format)
- Replikerer SQLite til Azure Blob Storage kontinuerlig
- Ved container-start: restorer fra blob hvis ingen lokal DB finnes
- Restore lokalt: bruk `/tmp/ls013/litestream` (v0.3.13 for macOS ARM64)

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
