# Innholdsspeiling fra prod til tt02

uSync speiler innhold (noder og media-metadata) fra prod til tt02, slik at tt02 ligner prod når fikser skal verifiseres. Skjema eies av ContentTypeComposer og er ikke en del av synken. Config ligger i `appsettings.json` under `uSync`.

Alt er manuelt. uSync gjør ingenting ved oppstart, deploy eller lagring.

## Forutsetninger

- Admin i backoffice i begge miljøer
- kubectl-kontekstene `dis-core-prod-aks` og `dis-core-tt02-aks` (Tailscale)
- tt02 kjører samme eller nyere image enn prod, aldri eldre

## Speilingsrunde

1. Prod-backoffice, Settings, uSync, kjør **Export**
2. Kopier eksporten fra prod-podden til tt02-podden

   ```bash
   kubectl --context dis-core-prod-aks -n product-kinorgeportal \
     exec deploy/umbraco -c umbraco -- tar -czf - -C /app uSync > /tmp/usync-prod.tgz

   kubectl --context dis-core-tt02-aks -n product-kinorgeportal \
     exec -i deploy/umbraco -c umbraco -- tar -xzf - -C /app < /tmp/usync-prod.tgz
   ```

3. tt02-backoffice, Settings, uSync, kjør **Import** (vanlig, aldri clean)
4. Media-filer ved behov, uSync tar bare metadata

   ```bash
   kubectl --context dis-core-prod-aks -n product-kinorgeportal \
     exec deploy/umbraco -c umbraco -- tar -czf - -C /app/wwwroot media > /tmp/media-prod.tgz

   kubectl --context dis-core-tt02-aks -n product-kinorgeportal \
     exec -i deploy/umbraco -c umbraco -- tar -xzf - -C /app/wwwroot < /tmp/media-prod.tgz
   ```

## Regler

- Import kjøres aldri i prod, kun eksport der
- Clean-import brukes aldri, den sletter noder som ikke er i eksporten
- Testinnhold på tt02 navngis med TEST-prefiks, det overlever import (upsert på GUID)
- Kladder i prod følger med eksporten og dukker opp som kladder på tt02
- Import publiserer på nytt, så publish-handlers (slug-vask, søkeindeksering når den kobles på) kjører for alt importert
