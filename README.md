# KI Norge

Portal for kunstig intelligens i norsk offentlig sektor, drevet av Digitaliseringsdirektoratet: https://ki.norge.no

- Dokumentasjonen starter i [docs/README.md](docs/README.md).
- Slik kjører du prosjektet lokalt og bidrar: [CONTRIBUTING.md](CONTRIBUTING.md).
- Agenter starter i [CLAUDE.md](CLAUDE.md).

## Mappene

```
apps/frontend/             Astro-frontenden, på Cloudflare Workers
apps/cms-umbraco/          Umbraco-CMS-et, i Altinn dis-core
apps/cache-kinorgeportal/  Cache-worker foran ki.norge.no
apps/cms-kinorgeportal/    Proxy-worker foran cms.ki.norge.no
syncroot/                  Kubernetes-manifestene for CMS-et
infrastructure/            Søkeindeksen som kode
shared/                    content-routes.json, felles for frontend og CMS
design-tokens/             Kilden til designtokenene
design-tokens-build/       De bygde tokenene frontenden bruker
scripts/                   Deploy, sikkerhetskopi, speiling til tt02 og smoketester
tests/                     Playwright-testene
docs/                      Dokumentasjonen
```
