# Innholdsspeiling fra prod til tt02

uSync speiler innhold (noder og media-metadata) fra prod til tt02, slik at tt02 ligner prod når fikser skal verifiseres. Skjema eies av ContentTypeComposer og er ikke en del av synken. Config ligger i `appsettings.json` under `uSync`.

Alt er manuelt. uSync gjør ingenting ved oppstart, deploy eller lagring.

## Forutsetninger

- Admin i backoffice i begge miljøer
- kubectl-kontekstene `dis-core-prod-aks` og `dis-core-tt02-aks` (Tailscale)
- tt02 kjører samme eller nyere image enn prod, aldri eldre

## Speilingsrunde

Transport-steget mellom poddene er pakket i `scripts/sync-prod-til-tt02.sh` med tre moduser:

| Modus | Tar med |
|-------|---------|
| `innhold` | uSync-innhold (dokumenter + media-metadata), ingen bildefiler |
| `media` | kun bildefiler (media-binærfiler) |
| `alt` | innhold + bildefiler |

Selve Export og Import gjøres fortsatt manuelt i backoffice, scriptet er bare transporten. Vanlig runde med innhold og bilder:

1. Prod-backoffice, Settings, uSync, kjør **Export**
2. Kjør transporten fra maskinen din:

   ```bash
   scripts/sync-prod-til-tt02.sh alt
   ```

3. tt02-backoffice, Settings, uSync, kjør **Import** (vanlig, aldri clean)

Når kun bildene trenger oppfriskning (ingen ny innholds-eksport/import):

```bash
scripts/sync-prod-til-tt02.sh media
```

Når media er uendret og du vil gå raskere:

```bash
scripts/sync-prod-til-tt02.sh innhold
```

Scriptet kopierer pod-til-pod gjennom maskinen din, sjekker at begge podder er nåbare (krever Altinn-VPN), og minner om Export/Import-stegene. `-y` hopper over bekreftelsen. Kontekster/namespace kan overstyres med miljøvariabler (`PROD_CTX`, `TT02_CTX`, `NS`, `POD`, `CONTAINER`).

## Regler

- Import kjøres aldri i prod, kun eksport der
- Clean-import brukes aldri, den sletter noder som ikke er i eksporten
- Testinnhold på tt02 navngis med TEST-prefiks, det overlever import (upsert på GUID)
- Kladder i prod følger med eksporten og dukker opp som kladder på tt02
- Import publiserer på nytt, så publish-handlers (slug-vask, søkeindeksering når den kobles på) kjører for alt importert
