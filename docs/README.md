# Dokumentasjon for ki.norge.no

ki.norge.no er portalen for kunstig intelligens i offentlig sektor, drevet av Digitaliseringsdirektoratet. Redaksjonen skriver innholdet i Umbraco, som kjører i Altinn dis-core, og en Astro-frontend på Cloudflare Workers viser det. Søket går mot Elastic Cloud.

## For den som drifter

- [Systemdokumentasjon](systemdokumentasjon.md): hvordan delene henger sammen, miljøene og helsesjekken.
- [Deploy](deploy.md): hvordan nye versjoner legges ut, og i hvilken rekkefølge.
- [Innholdsspeiling til tt02](innholdsspeiling-tt02.md): hvordan innhold kopieres fra prod til tt02.
- [Avhengigheter](avhengigheter.md): hvor avhengighetene bor, og hvordan de oppdateres.
- [Composers i CMS-et](cms-composers.md): hva som kjører i CMS-et, og hvilken konfig som slår det på.
- [Cache-purge](cloudflare-cache-purge.md): hvordan Cloudflare-cachen tømmes når noe publiseres.

## Resten

Alle dokumentene står i [llms.txt](llms.txt), med én linje hver. Beslutningsloggen og rapportene ligger i [rapporter/](rapporter/).
