# KI Norge

Portal for artificial intelligence in the Norwegian public sector, run by the Norwegian Digitalisation Agency (Digitaliseringsdirektoratet): https://ki.norge.no

- The documentation starts in [docs/README.md](docs/README.md).
- How to run the project locally and contribute: [CONTRIBUTING.md](CONTRIBUTING.md).
- Agents start in [CLAUDE.md](CLAUDE.md).

## The folders

```
apps/frontend/             The Astro frontend, on Cloudflare Workers
apps/cms-umbraco/          The Umbraco CMS, in Altinn dis-core
apps/cache-kinorgeportal/  Cache worker in front of ki.norge.no
apps/cms-kinorgeportal/    Proxy worker in front of cms.ki.norge.no
syncroot/                  The Kubernetes manifests for the CMS
infrastructure/            The search index as code
shared/                    content-routes.json, shared by frontend and CMS
design-tokens/             The source of the design tokens
design-tokens-build/       The built tokens the frontend uses
scripts/                   Deploy, backup, mirroring to tt02 and smoke tests
tests/                     The Playwright tests
docs/                      The documentation
```
