# Utvikling

Kart over koden for den som skal endre den: hvor ting ligger, og lenkene prosjektet bruker. Reglene står i [CLAUDE.md](../CLAUDE.md), og driften i [systemdokumentasjon.md](systemdokumentasjon.md).

## Frontend

Astro i server-modus, React-øyer, `@digdir/designsystemet-react` og `@digdir/designsystemet-css`. Kjører på Cloudflare Workers.

**Sider** i `apps/frontend/src/pages/`

- Forsiden, artikler, eksempler, kalender, veiledning (guide og steg), ki-tiltak, sandkasse og om-oss.
- Dynamiske ruter: `artikler/[slug]`, `eksempler/[slug]`, `kalender/[slug]`, `veiledning/[guide]`, `veiledning/[guide]/[step]`, `veiledning/[guide]/[step]/[stegartikkel]` og toppnivå `[slug]` for CMS-noder av typen `side`.

**Nøkkelfiler** i `apps/frontend/`

- `src/lib/umbraco.ts` henter alt fra CMS-et. Interfaces, fetch-funksjoner, og `mapItem()` som mapper innholdstyper til TypeScript-typer.
- `src/lib/aksel-icons.ts` er et statisk SVG-kart for Aksel-ikonene. Pakken er bare for React og kan ikke brukes direkte i Astro.
- `src/lib/seo.ts` lager JSON-LD.
- `src/middleware.ts` styrer caching, forhåndsvisning, markdown-varianter og sikkerhetsheadere.
- `src/lib/csp.ts` er CSP-en. Astro setter den på sidene via `astro.config.mjs`, og middleware setter den på svar som mangler den.
- `src/components/shared/ArticleBlocksRenderer.astro` er det eneste stedet artikkelmoduler rendres. Den brukes av artikler, eksempler, kalender, veiledning, sandkasse, om-oss og toppnivå `[slug]`. CSS-en ligger i `src/styles/article-blocks.css`.
- `src/components/shared/AkselIcon.astro` rendrer et Aksel-ikon etter navn.
- `src/components/shared/SearchDialog.tsx` er søkedialogen, en React-øy med `client:load`.
- `src/components/shared/CookieNotice.astro` er cookie-meldingen. Nettstedet bruker bare nødvendige cookies.
- `src/styles/` har `global.css`, `search-dialog.css`, `layout.css` og `article-blocks.css`.

**Layout og brytepunkter.** Layout-systemet står i `layout.css`. Gridet bryter ved 768px og 1024px. Eldre kode bruker også 640px.

## CMS

Umbraco 17 på .NET 10. Azure SQL i drift, SQLite lokalt.

**Nøkkelfiler** i `apps/cms-umbraco/`

- `Composers/ContentTypeComposer.cs` oppretter innholdstyper og elementtyper ved oppstart, og registrerer Block List-datatypene. Den kjører ikke i prod eller tt02. Alle composerne er forklart i [cms-composers.md](cms-composers.md).
- `Program.cs` starter CMS-et, med en sperre mot dobbel start, som ødelegger SQLite.
- `appsettings.Development.json` er lokal config med connection string, Delivery API-nøkkel og forhåndsvisningshemmelighet.
- `appsettings.json` er config for drift, med tom connection string, så env-variabelen overstyrer.

**Ny Block List-modul (elementtype).** Les skjemaregelen i `CLAUDE.md` først. Trinn 1 og 2 gjelder bare lokal utvikling inntil skjemaflyten er avklart.

1. Lag en ny metode i `ContentTypeComposer.cs` som oppretter elementtypen med feltene.
2. Registrer den i `InitializeAsync`, og legg den til i riktig Block List-datatype.
3. Legg til interface og mapping i `mapItem()` eller `mapArtikkelBlocks()` i `umbraco.ts`.
4. Legg til rendering for den nye `contentType`-verdien i `ArticleBlocksRenderer.astro`.

**Elementtyper for artikler**, tillatt i `BlockListArtikkelInnhold` i uSync:

- artikkelTekst, artikkelBildeSeksjon, artikkelTrekkspill, artikkelFremheving
- artikkelProsessteg, artikkelByline, artikkelInnholdFra, artikkelKontaktkort

**RichText-verktøylinja** settes i `ContentTypeComposer` (`EnsureRichTextDataTypes`), og i drift i `uSync/v17/DataTypes/RichtextEditor.config`. Den har H2, H3 og H4.

**Databasen.** Azure SQL i dis-core erstattet SQLite med Litestream, som ga låsekonflikter når flere redaktører jobbet samtidig. Lokalt brukes fortsatt SQLite.

## Adresser

- Frontend i prod: https://ki.norge.no, og https://ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev
- CMS i prod: https://cms.ki.norge.no/umbraco, internt https://kinorgeportal.prod.dis-core.altinn.cloud/umbraco
- CMS i tt02: https://cms.ki.test.norge.no/umbraco, internt https://kinorgeportal.tt02.dis-core.altinn.cloud/umbraco
- Helse: `/health`, se «Helsesjekk» i [systemdokumentasjon.md](systemdokumentasjon.md)
- Domenet ki.norge.no ligger i en Cloudflare-sone av typen partial på norge.no.

Workere og miljøer står i «Miljøer i korthet» i [systemdokumentasjon.md](systemdokumentasjon.md).

## Lenker

- Figma, hovedfil: https://www.figma.com/design/XExt0cORNSEpZFI4rQY8AN/KI-Norge-portal-skisse
- Figma, handlingsmoduler: https://www.figma.com/design/yOf46bRFjXayIgpQLKJi5h/Handlingsmoduler
- Confluence, tekniske oppgaver: https://digdir.atlassian.net/wiki/spaces/BTP/pages/4195352733
- GitHub-prosjektet (kanban): https://github.com/orgs/digdir/projects/58
- nb-nn-eval, verktøy for oversettelse: https://github.com/larsekhansen/nb-nn-eval
- Designsystemet: https://www.designsystemet.no/komponenter
- Aksel-ikoner: https://aksel.nav.no/ikoner
