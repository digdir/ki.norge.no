# Mock-CMS for lokal frontend-utvikling

Lar frontend kjore uten et ekte CMS. En liten Node-server speiler Umbraco
Delivery API v2 sitt content-endepunkt fra en fanget fixture, slik at sider
rendrer med realistisk innhold. Kun for utvikling.

## Bruk

Fra repo-rot:

```bash
npm run frontend:dev:mock
```

Starter mock-CMS (port 5050) og Astro dev-server mot den i samme kommando.
Ctrl-C stopper begge. Krever `pnpm install` i `apps/frontend` forst.

Bare mock-serveren alene: `npm run mock-cms`.

## Hva mock-en stotter

Alle Delivery API-kall i `umbraco.ts` gar mot ett endepunkt
(`/umbraco/delivery/api/v2/content`) med `filter=contentType:X`, `sort`,
`take` og `skip`. Mock-serveren implementerer akkurat disse over fixturen.

## Oppdatere fixturen

Fixturen (`delivery-content.json`) er et oyeblikksbilde fra en seedet lokal
CMS-instans. Re-fang nar skjema eller demo-innhold endrer seg:

```bash
# 1. Kjor CMS-et lokalt med demo-seederen (npm run cms:dev), vent til det er oppe
# 2. Fang innholdet:
curl -s "http://localhost:5000/umbraco/delivery/api/v2/content?take=200" \
  > apps/frontend/tools/mock-cms/delivery-content.json
```

Demo-innholdet seedes av `ContentSeeder.SeedDemoContentForDev` (dev-gated).
