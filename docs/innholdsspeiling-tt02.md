# Innholdsspeiling fra prod til tt02

tt02 skal ligne prod når en endring skal prøves der. Skjemaet følger med av seg selv, men innholdet kopieres for hånd, én vei, fra prod til tt02.

## Hva som følger med

- **Skjemaet** eies av uSync i begge miljøene (`USYNC_OWNS_SCHEMA=true`). Skjemafilene ligger i imaget, og uSync importerer dem ved hver oppstart. Det er ikke en del av speilingen.
- **Innholdet**, altså noder og media-metadata, eksporteres i prod og importeres i tt02.
- **Bildefilene følger ikke med.** De ligger i Azure Blob, i en egen lagringskonto per miljø, og det finnes ikke noe skript som kopierer dem fra prod til tt02. Bilder i speilet innhold mangler derfor på tt02.

## Oppsettet

| | prod | tt02 |
| --- | --- | --- |
| uSync-sett | `Default`: eksport av innhold og media, import og eksport av skjema | `Speiling`: import og eksport av alt |
| `ImportAtStartup` | `Settings` | `Settings,Content` |

Innholdsmappa `/app/uSync/v17/Content` er varig i begge miljøene, på volumet `umbraco-data`. Media-metadataene i `v17/Media` ligger på containerens skrivelag og forsvinner ved omstart.

På tt02 betyr dette at hver oppstart importerer det siste innholdet som ble kopiert dit. Endringer i speilede noder på tt02 nullstilles ved neste omstart. Noder som bare finnes på tt02, får stå. Skal tt02 heller være et sted å prøve ting, settes `ImportAtStartup` tilbake til `Settings` i `syncroot/tt02/kustomization.yaml`.

Konfigurasjonen står under `uSync` i `apps/cms-umbraco/appsettings.json` og i `syncroot/prod` og `syncroot/tt02`.

## Forutsetninger

- Admin i backofficet i begge miljøene
- kubectl-kontekstene `dis-core-prod-aks` og `dis-core-tt02-aks`, med Altinn-VPN
- tt02 kjører samme eller nyere image enn prod, aldri eldre

## Speilingsrunde

1. I prod-backofficet: Settings, uSync, **Export**.
2. Kopier eksporten fra maskinen din:

   ```bash
   scripts/sync-prod-til-tt02.sh --sjekk   # vis antall filer og nyeste fil, kopier ingenting
   scripts/sync-prod-til-tt02.sh           # kopier, spør først
   ```

   Skriptet kopierer `v17/Content`, og `v17/Media` når den finnes, pod til pod gjennom maskinen din. Skjemafilene følger ikke med, for en eldre skjemaeksport fra prod kunne rullet tilbake nyere skjema på tt02 og slettet felt. `-y` hopper over bekreftelsen. Kontekster og navnerom kan overstyres med `PROD_CTX`, `TT02_CTX`, `NS`, `POD` og `CONTAINER`.

3. I tt02-backofficet: Settings, uSync, **Import**. Aldri clean.

Innholdsmappa på prod er varig, så den kan ha en gammel eksport. Se på tidspunktet for nyeste fil som skriptet viser, før du kopierer.

## Regler

- Innhold importeres aldri i prod, det eksporteres bare derfra.
- Clean-import brukes aldri. Den sletter noder som ikke er i eksporten.
- Import er upsert på GUID. Noder som er slettet i prod, blir liggende på tt02.
- Kladder i prod følger med eksporten og dukker opp som kladder på tt02.
- Import publiserer på nytt, så handlerne for publisering kjører for alt importert. Søkeindekseringen er av på tt02.
- Testinnhold på tt02 navngis med prefikset TEST. Faste testartikler ligger som filer i git, se [uSync-testinnhold/README.md](../apps/cms-umbraco/uSync-testinnhold/README.md).
