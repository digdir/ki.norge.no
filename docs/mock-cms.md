# Mock-CMS for lokal frontend-utvikling

Lar frontend kjore uten et ekte CMS. En liten Node-server speiler Umbraco
Delivery API v2 sitt content-endepunkt fra en fanget fixture, slik at sider
rendrer med realistisk innhold. Kun for utvikling.

## Bruk

Fra repo-rot:

```bash
pnpm run frontend:dev:mock
pnpm run frontend:dev:mock --port 4324   # flagg går videre til astro dev
```

Starter mock-CMS (port 5050, `MOCK_PORT` for en annen) og Astro dev-server mot
den i samme kommando. Ctrl-C, eller `pnpm exec astro dev stop` i
`apps/frontend`, stopper begge. Mock-porten kan ikke være 5060 eller 5061, de
blokkeres av fetch. Krever `pnpm install` i `apps/frontend` først.

Bare mock-serveren alene: `npm run mock-cms`.

## Hva mock-en stotter

Alle Delivery API-kall i `umbraco.ts` gar mot ett endepunkt
(`/umbraco/delivery/api/v2/content`) med `filter=contentType:X`, `sort`,
`take` og `skip`. Mock-serveren implementerer akkurat disse over fixturen.

## Oppdatere fixturen

Fixturen (`delivery-content.json`) er et øyeblikksbilde av Delivery API-et. Den ble
fanget fra en lokal CMS-instans med demoinnhold. `ContentSeeder`, som laget det
innholdet, er fjernet, så et nytt lokalt CMS er tomt. Skal fixturen fanges på nytt,
må det skje fra et CMS som har innhold:

```bash
curl -s "http://localhost:5000/umbraco/delivery/api/v2/content?take=200" \
  > apps/frontend/tools/mock-cms/delivery-content.json
```
