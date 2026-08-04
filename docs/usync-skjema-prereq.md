# Forutsetninger før uSync kan overta skjemaet fra ContentTypeComposer

Gjelder den fulle migreringen (jobb 2), ikke tt02-piloten (#560). Piloten
transporterer filer med `scripts/sync-prod-til-tt02.sh` og trenger ikke noe av
dette.

Denne PR-en legger kun rørleggingen. Selve skjemaeksporten er bevisst ikke
committet, se «Nøklene må komme fra prod» under.

## Hva som manglet

Migreringsplanen ba oss bekrefte at `apps/cms-umbraco/uSync/` ikke er
gitignorert og at Dockerfile tar den med i imaget. Begge deler var usanne:

- `.gitignore` ignorerte hele `uSync/`, og null uSync-filer var committet.
- `KiNorge.Cms.csproj` hadde ingen regel som kopierte uSync-filer til
  publish-output, og Dockerfile sender bare `/app/publish` videre til
  runtime-imaget.

Fjernet man composeren i den tilstanden, ville prod startet uten skjemakilde:
ingen composer og ingen filer å importere.

## Hva denne PR-en endrer

- `.gitignore` er snevret inn. `ContentTypes/` og `DataTypes/` kan spores,
  `Content/` og `Media/` er fortsatt ignorert siden de er speilings-artefakter.
- `KiNorge.Cms.csproj` kopierer skjemafilene til output og publish. Globen
  treffer ingenting i dag, så regelen er inert til en eksport er committet.

## Nøklene må komme fra prod

ContentTypeComposer setter aldri `.Key` selv, så Umbraco tildeler
content-typene tilfeldige GUID-er per database. Målt på to ferske lokale
databaser: **alle 58 dokumenttype-nøkler var forskjellige**. Blant datatypene
var 36 like (Umbracos innebygde har faste nøkler) og 21 forskjellige (de
composeren lager).

Innhold refererer blokker via nøkkel. Committer man en skjemaeksport tatt fra
en dev-maskin, og den senere importeres i prod, får prod-typene dev-nøkler som
prod sitt innhold ikke peker på. Alle blokkmoduler blir «Unsupported». Det er
nøyaktig symptomet tt02-speilet har i dag, men da i prod.

**Derfor: eksporten som committes skal tas fra PROD**, via backoffice,
Settings, uSync, Export. Ikke fra lokal maskin og ikke fra tt02.

## Eksporten må tas fra en ferdig bygget database

`ExportAtStartup` kan kappløpe med composeren. Målt: på en boot der composeren
bygget skjemaet samtidig, eksporterte uSync 58 datatyper mens en ferdig bygget
database ga 61.

Eksporter derfor fra en instans som allerede har kjørt composeren ferdig, altså
en vanlig kjørende prod, ikke en førstegangs-boot.

## Verifisert underveis

Eksporten er tro mot databasen. Sammenlignet uSync-filene mot SQLite direkte:

| | database | uSync-filer | avvik |
|---|---|---|---|
| Dokumenttyper | 58 | 58 | ingen |
| Datatyper | 61 | 61 | ingen |
| Nøkler | — | — | ingen |
| Properties per type | 324 | — | ingen |

Differansen mellom 66 og 58 content-typer i databasen er Umbracos egne
innebygde (`File`, `Folder`, `Image`, `Member`, `umbracoMedia*`), som
composeren ikke lager og som ikke hører hjemme i eksporten.

## Gjenstår før jobb 2

1. Ta skjemaeksport fra prod og commit `ContentTypes/` + `DataTypes/`.
2. Kjør A/B-verifiseringen: én database bygget av composeren mot én bygget av
   uSync-import, og sammenlign typer, properties, datatyper og tillatte barn.
3. Pensjoner composeren og aktiver uSync-import i SAMME PR. Kjører begge
   samtidig, slåss de om eierskapet.

## Lokal gotcha

Umbraco skriver om `appsettings.json` ved lokal oppstart. Den stripper
kommentarer og legger inn en generert `Imaging.HMACSecretKey`. Sjekk
`git status` etter lokal CMS-kjøring så ikke en generert nøkkel havner i en
commit.
