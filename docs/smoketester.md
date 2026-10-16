# Smoketester

To lag med tester som sjekker at nettstedet og CMS-et svarer. Begge kjører i CI.

## 1. `scripts/smoke-test.sh`

Bash og curl, ferdig på rundt ti sekunder. Henter alle offentlige sider og de viktigste kallene mot Delivery API, og feiler på alt som ikke er 2xx eller har tom kropp. Fanger 4xx- og 5xx-feil, sider som mangler, ødelagte filtre og sortering i Delivery API, og blokker som har falt til «Unsupported».

```bash
bash scripts/smoke-test.sh           # prod (standard)
bash scripts/smoke-test.sh --tt02    # tt02, krever Altinn-VPN. Kjør den etter en speiling
bash scripts/smoke-test.sh --local   # localhost:4321 og localhost:5000
```

`--local` krever innhold i det lokale CMS-et. Mot et tomt lokalt CMS feiler den.

**I CI:** jobben «Smoke test prod» kjører `bash scripts/smoke-test.sh --prod` ved hver push til `main`, ikke på PR-er.

## 2. Playwright

Nettlesertester for det curl ikke ser. Oppsettet står i `tests/playwright.config.ts`, med prosjektene `frontend` (`tests/frontend/`) og `cms` (`tests/cms/`). `TARGET=local` tester mot localhost, ellers mot prod. Innloggingen i CMS-et bruker `CMS_USER` og `CMS_PASS`, og faller tilbake på den lokale admin-kontoen.

**I CI:** jobben «Playwright smoke (frontend + CMS auth)» kjører på hver PR og push. Den starter et lokalt CMS med `dotnet run` og frontenden med `pnpm run dev`, og kjører to spesifikasjoner fra `apps/frontend`:

```bash
cd apps/frontend
TARGET=local npx playwright test --config=../../tests/playwright.config.ts --project=frontend tests/frontend/smoke.spec.ts
TARGET=local npx playwright test --config=../../tests/playwright.config.ts --project=cms tests/cms/auth-and-tree.spec.ts
```

- `smoke.spec.ts` sjekker at de offentlige sidene laster, og at detaljsidene for første artikkel og første eksempel rendres.
- `auth-and-tree.spec.ts` logger inn i backofficet, sjekker strukturen i innholdstreet og spør diagnostics-endepunktet.

Det lokale CMS-et i CI starter uten uSync-import og uten innhold. Testene kjører derfor mot skjemaet `ContentTypeComposer` lager, ikke mot prods. Se [cms-composers.md](cms-composers.md).

Samme kommandoer kjører lokalt, med CMS og frontend oppe på 5000 og 4321.
