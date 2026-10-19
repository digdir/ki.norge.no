# Development

A map of the code for whoever is going to change it: where things are, and the links the project uses. The rules are in [CLAUDE.md](../CLAUDE.md), and operations in [system-documentation.md](system-documentation.md).

## Frontend

Astro in server mode, React islands, `@digdir/designsystemet-react` and `@digdir/designsystemet-css`. Runs on Cloudflare Workers.

**Pages** in `apps/frontend/src/pages/`

- The front page, articles, examples, calendar, guidance (guide and steps), ki-tiltak, sandkasse and om-oss.
- Dynamic routes: `artikler/[slug]`, `eksempler/[slug]`, `kalender/[slug]`, `veiledning/[guide]`, `veiledning/[guide]/[step]`, `veiledning/[guide]/[step]/[stegartikkel]` and top-level `[slug]` for CMS nodes of type `side`.

**Key files** in `apps/frontend/`

- `src/lib/umbraco.ts` fetches everything from the CMS. Interfaces, fetch functions, and `mapItem()` which maps content types to TypeScript types.
- `src/lib/aksel-icons.ts` is a static SVG map for the Aksel icons. The package is React-only and cannot be used directly in Astro.
- `src/lib/seo.ts` produces JSON-LD.
- `src/middleware.ts` handles caching, preview, markdown variants and security headers.
- `src/lib/csp.ts` is the CSP. Astro sets it on the pages via `astro.config.mjs`, and middleware sets it on responses that lack it.
- `src/components/shared/ArticleBlocksRenderer.astro` is the only place article modules are rendered. It is used by articles, examples, calendar, guidance, sandkasse, om-oss and top-level `[slug]`. The CSS is in `src/styles/article-blocks.css`.
- `src/components/shared/AkselIcon.astro` renders an Aksel icon by name.
- `src/components/shared/SearchDialog.tsx` is the search dialog, a React island with `client:load`.
- `src/components/shared/CookieNotice.astro` is the cookie notice. The site uses only essential cookies.
- `src/styles/` has `global.css`, `search-dialog.css`, `layout.css` and `article-blocks.css`.

**Layout and breakpoints.** The layout system is in `layout.css`. The grid breaks at 768px and 1024px. Older code also uses 640px.

## CMS

Umbraco 17 on .NET 10. Azure SQL in production, SQLite locally.

**Key files** in `apps/cms-umbraco/`

- `Composers/ContentTypeComposer.cs` creates document types and element types at startup, and registers the Block List data types. It does not run in prod or tt02. All the composers are explained in [cms-composers.md](cms-composers.md).
- `Program.cs` starts the CMS, with a guard against double start, which corrupts SQLite.
- `appsettings.Development.json` is local config with the connection string, Delivery API key and preview secret.
- `appsettings.json` is config for production, with an empty connection string, so the env variable overrides it.

**New Block List module (element type).** Read the schema rule in `CLAUDE.md` first. Steps 1 and 2 apply only to local development until the schema flow is settled.

1. Create a new method in `ContentTypeComposer.cs` that creates the element type with its fields.
2. Register it in `InitializeAsync`, and add it to the right Block List data type.
3. Add the interface and mapping in `mapItem()` or `mapArtikkelBlocks()` in `umbraco.ts`.
4. Add rendering for the new `contentType` value in `ArticleBlocksRenderer.astro`.

**Element types for articles**, allowed in `BlockListArtikkelInnhold` in uSync:

- artikkelTekst, artikkelBildeSeksjon, artikkelTrekkspill, artikkelFremheving
- artikkelProsessteg, artikkelByline, artikkelInnholdFra, artikkelKontaktkort

**The RichText toolbar** is set in `ContentTypeComposer` (`EnsureRichTextDataTypes`), and in production in `uSync/v17/DataTypes/RichtextEditor.config`. It has H2, H3 and H4.

**The database.** Azure SQL in dis-core replaced SQLite with Litestream, which caused lock conflicts when several editors worked at the same time. SQLite is still used locally.

## Addresses

- Frontend in prod: https://ki.norge.no, and https://ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev
- CMS in prod: https://cms.ki.norge.no/umbraco, internally https://kinorgeportal.prod.dis-core.altinn.cloud/umbraco
- CMS in tt02: https://cms.ki.test.norge.no/umbraco, internally https://kinorgeportal.tt02.dis-core.altinn.cloud/umbraco
- Health: `/health`, see "Health check" in [system-documentation.md](system-documentation.md#health-check)
- The domain ki.norge.no sits in a Cloudflare zone of type partial on norge.no.

Workers and environments are listed in "Environments at a glance" in [system-documentation.md](system-documentation.md#environments-at-a-glance).

## Links

- Figma, main file: https://www.figma.com/design/XExt0cORNSEpZFI4rQY8AN/KI-Norge-portal-skisse
- Figma, action modules: https://www.figma.com/design/yOf46bRFjXayIgpQLKJi5h/Handlingsmoduler
- Confluence, technical tasks: https://digdir.atlassian.net/wiki/spaces/BTP/pages/4195352733
- The GitHub project (kanban): https://github.com/orgs/digdir/projects/58
- nb-nn-eval, translation tool: https://github.com/larsekhansen/nb-nn-eval
- Designsystemet: https://www.designsystemet.no/komponenter
- Aksel icons: https://aksel.nav.no/ikoner
