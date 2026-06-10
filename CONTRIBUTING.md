# Contributing

Repo: https://github.com/digdir/ki.norge.no  
Live site: https://ki.norge.no  
CMS: https://cms.ki.norge.no/umbraco

## Setup

```bash
# Frontend (Astro, runs on Node locally)
pnpm run frontend:dev         # http://localhost:4321

# CMS (Umbraco 17 / .NET 10)
pnpm run cms:dev              # http://localhost:5000/umbraco
                              # admin@ki.norge.no / KiNorge2025!

# Frontend pointing at prod CMS (no local CMS needed)
pnpm run frontend:dev:prod
```

First time the CMS runs, it auto-creates an admin and seeds demo content.

## Project structure

```
apps/frontend/      Astro SSR frontend, runs on Node / Cloudflare Workers
apps/cms-umbraco/   Umbraco 17 CMS, .NET 10, Azure SQL (prod) / SQLite (local)
scripts/            Ops scripts (smoke-test.sh)
tests/              Playwright tests (frontend + CMS smoke)
```

See `CLAUDE.md` for fuller context on architecture, content types, and key decisions.

## Workflow

1. Branch off `feature/umbraco-migration` (current active branch)
2. Make changes — keep commits small and focused
3. Run `dotnet build` (CMS) and `npx astro build` (frontend) locally
4. Run `bash scripts/smoke-test.sh --local` (or `--prod` for prod check)
5. Open a PR — fill in the template

## Style

- Norwegian bokmål for editor-facing strings, comments, and commit messages
- No emojis in code or commits
- No em dashes (use commas/periods)
- Minimal colon usage
- See `~/.claude/skills/STYLE.md` for the full guide

## Browser support

We target the last two stable major versions of Chrome, Firefox, Safari, and
Edge. Mobile Safari and Chrome on iOS/Android (last two majors) are also in
scope. We don't support IE, legacy Edge, or Opera Mini.

If a feature requires polyfills for these targets, document the trade-off in
the PR.

## Deployment

CMS deploys via Altinn dis-core (GitHub Actions). Frontend deploys to Cloudflare
Workers with `pnpm run frontend:deploy:prod` (and `:tt02`). The legacy Azure
Container Apps deploy has been removed.

## Reporting security issues

See `SECURITY.md`. Don't open public issues for vulnerabilities — email drift@digdir.no.
