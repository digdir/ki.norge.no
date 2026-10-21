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

First time the CMS runs, it auto-creates an admin.

That admin is a throwaway account against your own local SQLite file. It unlocks
nothing shared, so the password is not a secret. Do not reuse the value, or the
pattern, anywhere it is real. Real values live in Azure Key Vault per
environment, documented in Confluence.

## Project structure

```
apps/frontend/      Astro SSR frontend, runs on Node / Cloudflare Workers
apps/cms-umbraco/   Umbraco 17 CMS, .NET 10, Azure SQL (prod) / SQLite (local)
scripts/            Ops scripts (smoke-test.sh)
tests/              Playwright tests (frontend + CMS smoke)
```

The documentation starts in [docs/README.md](docs/README.md). Agents start in `CLAUDE.md`.

## Workflow

1. Branch off `main`
2. Make changes — keep commits small and focused
3. Run `pnpm run lint`, `dotnet build` (CMS) and `npx astro build` (frontend) locally
4. Run `bash scripts/smoke-test.sh` against prod after a deploy. See [docs/smoke-tests.md](docs/smoke-tests.md)
5. Open a PR — fill in the template

## Style

- English for everything on GitHub and in the code: comments, docs, commit messages, PRs and issues
- Norwegian bokmål only for what site visitors and CMS editors see
- No emojis in code or commits
- No em dashes (use commas/periods)
- Minimal colon usage

## Browser support

We target the last two stable major versions of Chrome, Firefox, Safari, and
Edge. Mobile Safari and Chrome on iOS/Android (last two majors) are also in
scope. We don't support IE, legacy Edge, or Opera Mini.

If a feature requires polyfills for these targets, document the trade-off in
the PR.

## Deployment

CMS deploys via Altinn dis-core (GitHub Actions). Frontend deploys to Cloudflare
Workers with `pnpm run frontend:deploy:prod` (and `:tt02`). See
[docs/deploy.md](docs/deploy.md).

## Reporting security issues

Don't open public issues for vulnerabilities. This repo has no `SECURITY.md` of its
own, so Digdir's organization-wide security policy applies:
https://github.com/digdir/.github/blob/main/SECURITY.md. The site also publishes
https://ki.norge.no/.well-known/security.txt.
