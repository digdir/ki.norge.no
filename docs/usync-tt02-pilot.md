# uSync tt02-pilot (uSync eier skjema på tt02, composer på prod)

Lar tt02 speile prod sitt skjema i tillegg til innhold og media, så
artikkelmodulene løser seg i speilet innhold. Prod er urørt og eier fortsatt
skjemaet via `ContentTypeComposer`.

## Bakgrunn

`ContentTypeComposer` lager content-typer uten fast `.Key`, så Umbraco gir dem
tilfeldige nøkler per miljø. Speilet prod-innhold refererer blokker via nøkkel,
og prod-nøklene finnes ikke på tt02, så modulene vises som «Unsupported».

uSync bruker fil-nøkkelen kun når den selv oppretter typen. Skrur vi av
composer-skjemaet på tt02 (`USYNC_OWNS_SCHEMA=true`) og lar uSync importere
prod-eksporten, opprettes typene med prod sine nøkler og modulene løser seg.

## Hva PR-en endrer

- `ContentTypeComponent`: hopper over skjema-asserting når
  `USYNC_OWNS_SCHEMA=true`. Fraværende env-var = composeren kjører som før.
- `appsettings.json`: `ContentTypeHandler` + `DataTypeHandler` lagt til begge
  uSync-sett. `Default` er eksport-only (read-only), `Speiling` har import.
- `syncroot/tt02/kustomization.yaml`: setter `USYNC_OWNS_SCHEMA=true`. Prod sin
  kustomization er urørt.

## Prod-sikkerhet

- Skjema-bryteren er env-gated til tt02. Prod mangler env-varen, så composeren
  asserter skjema som i dag.
- Prod sitt `Default`-sett er eksport-only for alle handlers. Import er
  strukturelt blokkert (`IsValidAction(Import, ["Export"])` = false), også om en
  import-trigger skulle lekke inn.
- Skjema-eksport er read-only. Den skriver filer, rører ikke databasen.
- Ingen oppstarts-triggere. uSync gjør ingenting før en admin kjører eksport
  eller import i backoffice.

## Kjøre piloten (manuelt, tt02)

1. Deploy imaget til tt02 (composer-skjema av der via kustomization).
2. Tøm tt02 sitt composer-skjema, ellers blokkerer de gamle tt02-nøklene
   importen. Fersk database eller slett content-typene i tt02-backoffice.
3. Prod backoffice, Settings, uSync, Export. Gir skjema + innhold + media som
   filer under `/app/uSync`.
4. `scripts/sync-prod-til-tt02.sh innhold` (eller `alt` for media også).
   Transporterer hele `/app/uSync` inkludert ContentTypes og DataTypes.
5. tt02 backoffice, Settings, uSync, Import (aldri clean). Speiling-settet
   oppretter typene med prod sine nøkler og importerer innholdet.

Bruk Import-knappen, ikke en oppstarts-import. `ImportAtStartup` respekterer ikke
`DefaultSet=Speiling` og kjører mot det eksport-only Default-settet.

## Kjente forbehold

- tt02-skjemaet blir et snapshot av prod sitt composer-skjema. Endrer composeren
  skjema i en ny prod-deploy, må prod re-eksporteres og tt02 re-importeres.
- Noen noder med `bakgrunn`-felt publiseres ikke ved import (blir kladd) fordi
  verdien ikke validerer mot datatype-configen. Egen content-sak, gjelder også
  dagens innholdsspeiling.
