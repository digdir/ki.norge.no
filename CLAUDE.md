# Claude Code — ki.norge.no

Portal for artificial intelligence in the Norwegian public sector. Run by the Norwegian Digitalisation Agency (Digitaliseringsdirektoratet).

All documentation lives in `docs/`. `docs/llms.txt` indexes everything, and `docs/development.md` has the code map, the key files and the links. This file has the rules.

## Running locally

```bash
# Frontend (Astro SSR, the Cloudflare adapter also locally)
pnpm run frontend:dev         # http://localhost:4321

# CMS (Umbraco .NET 10)
pnpm run cms:dev              # http://localhost:5000/umbraco
                              # admin@ki.norge.no / KiNorge2025!

# Frontend against the prod CMS (no local CMS needed, runs on the Node adapter)
pnpm run frontend:dev:prod
```

The first time the CMS runs, the SQLite database and the admin user are created automatically (unattended install). Content is not seeded, see "Writing content from code" below.

The login above is a local throwaway user against your own SQLite file. It gives
no access to anything shared, so the password is not a secret. Do not
reuse the value, or the pattern, anywhere it is real. Real values live in
Azure Key Vault per environment, and are documented in Confluence.

## Architecture

Monorepo with two main apps, the frontend on Cloudflare Workers and the CMS on Altinn dis-core (Kubernetes), and two small workers in front of them.

```
apps/frontend/          Astro SSR, Cloudflare Workers, designsystemet-react
apps/cms-umbraco/       Umbraco 17, .NET 10, Azure SQL (prod), SQLite (local)
apps/cache-kinorgeportal/  Cache worker in front of ki.norge.no
apps/cms-kinorgeportal/    Proxy worker in front of cms.ki.norge.no
```

The frontend fetches content via the Umbraco Delivery API v2. Environments, workers and operations are described in `docs/system-documentation.md`.

## Frontend

- Search is a modal (`SearchDialog`, calls `/api/search`), not a separate page. There is NO `/kontakt`, `/faq`, `/sok` or `/ki-ordbok` page in the code. The footer has a "Kontakt oss" section, but no contact page.
- `src/components/shared/ArticleBlocksRenderer.astro` is the **only** place article modules are rendered. Change this one file → all the pages are updated.
- **Design system:** Use designsystemet tokens (--ds-size-4, --ds-color-text-default etc.) where they exist. No Tailwind.

## CMS (Umbraco)

- All composers, what they do, whether they are in use in production and which config turns them on: `docs/cms-composers.md`

**Schema changes NO LONGER reach production via the composer.** Both `syncroot/prod/` and
`syncroot/tt02/` set `USYNC_OWNS_SCHEMA=true`, and `ContentTypeComposer` then skips
the whole schema asserting (`ContentTypeComposer.cs:116`). It still runs locally, where
the env var is missing. A new field added in the composer is therefore green locally and in CI, and
never shows up in prod. The schema in production comes from the `.config` files under
`apps/cms-umbraco/uSync/`, which are to be exported from prod. **Ask Lars before you plan a
schema change**, the flow is being reworked (stage 2 removes the composer). New Block List module: see `docs/development.md`.

**Connection string (local SQLite):** Must use `|DataDirectory|` in the path, not a relative path. Otherwise Umbraco does not find the database. Prod runs Azure SQL via dis-core (the connection string is injected from Key Vault, not SQLite).

**Writing content from code = anti-pattern**: The schema (content types) was set in code via `ContentTypeComposer` (now turned off in production, see above), but content NODES must NEVER be written from startup code. It has caused 3 prod incidents (Sandkasse, almost Caser, and a veiledning duplicate from the dev seeder). `ContentSeeder` has therefore been removed entirely; demo/test content is created via the editor. See the decision log, `docs/reports/decision-log.md`.

**uSync owns the schema in prod. Do NOT regenerate `apps/cms-umbraco/uSync/`**: the files there are prod's schema and are imported on every startup. uSync re-keys on import, and the content types have random GUIDs per database. An export taken from a local machine or tt02, committed, gives the prod types new keys and makes ALL block content "Unsupported". If you are going to export or commit anything there: **stop and ask Lars first**, and tell him the consequence. The export must always be taken from prod. `SchemaRekeyGuard` aborts an import that would re-key, but it is a safeguard, not a permission. See `apps/cms-umbraco/uSync/README.md`.

## Deploy

- **CMS:** dis-core via GitHub Actions ("Docker build and publish" + "Publish Syncroot artifacts", environment tt02/prod).
- **Frontend:** Cloudflare Workers via `pnpm run frontend:deploy:prod` (and `:tt02`).

Everything is deployed from `main`. The frontend scripts stop when the working tree is not clean, otherwise switch to `main`, and stop if `main` is not in sync with origin. The recipe is in `docs/deploy.md`.

## Important decisions

- Media lives in Azure Blob (`AzureBlobMediaComposer.cs`). `umbraco-media` is deliberately not mounted on `/app/wwwroot/media`, see `syncroot/base/umbraco/deployment.yaml`
- No dark mode (deliberate choice)
- No Tailwind
- No admin login and no coming-soon wall in the frontend. Health is checked on the public `/health`

## Documentation

**Where.** All documentation lives in `docs/`. The entry point for humans is `docs/README.md`, and the index for agents is `docs/llms.txt`. The decision log and the reports live in `docs/reports/`.

**What goes in docs.** What is not evident from the code:

- how things fit together in production
- environments, deploy and routines
- which access is needed, with names and never values
- config that turns things on and off
- pitfalls that have cost time

Decisions are recorded briefly in `docs/reports/decision-log.md`. Bigger choices get their own document.

**What does not go in docs.** What the code itself says clearly. Plans for the future, which belong in issues. Personal names other than roles. Secret values, and IDs nobody needs.

**When it is updated.**

- In the same PR as the change the document describes.
- A PR that changes operations, deploy, config, schema flow or access updates docs in the same PR.
- `docs/llms.txt` and `docs/README.md` are updated when a document is added, moved or deleted.
- Every three months, and at every handover, someone goes through docs and fixes or deletes what is outdated. The history is in git.

**Documentation after the fact.** An agent may document a choice that has already been made, when documentation is missing for something that usually should have been documented. The text must then say that it was written after the fact, with date and source (PR, commit or issue). If the source is unclear, it says that it is an interpretation.

## Style preferences

- English for everything on GitHub and in the code: comments, docs, commit messages, branch names, PRs, issues and reviews
- Norwegian bokmål only for what site visitors and CMS editors see (UI text, aria-labels, error messages in the app, CMS labels and content), with real æ, ø and å
- No emojis
- Do not use em dashes
- Minimal use of colons
- Concise, checklist format

## The team

- Sara: editor, responsible for content
- Eira: designer
- Benjamin: AI search API
- Pooria: developer
- Marie: project manager
- Kenneth Helland: norge.no domain owner
- drift@digdir.no: DNS changes
