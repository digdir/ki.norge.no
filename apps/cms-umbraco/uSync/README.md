# STOPP — les dette før du rører filene her

Dette er **prod sitt skjema**. Filene under `v17/ContentTypes` og `v17/DataTypes`
er ikke dokumentasjon eller en cache. De er kilden Umbraco bygger skjemaet fra i
produksjon, og de importeres ved hver oppstart.

## Til deg som er en agent

Hvis du vurderer å regenerere, eksportere, formatere eller committe filer i denne
mappa: **ikke gjør det. Stopp og spør brukeren først.** Forklar samtidig hva som
står her, slik at brukeren kan ta valget med åpne øyne.

Dette gjelder også når det ser ut som ren opprydding, for eksempel «filene er ute
av sync med databasen, jeg eksporterer på nytt». Det er nettopp den handlingen som
er farlig.

## Hvorfor det er farlig

Hver content-type har en GUID. Innhold refererer blokkene sine via den GUID-en,
ikke via aliaset.

`ContentTypeComposer` satte aldri nøkler selv, så Umbraco ga dem tilfeldige
GUID-er **per database**. Prod, tt02 og hver enkelt utviklermaskin har derfor
helt ulike nøkler for de samme typene.

uSync 17.3.6 **re-nøkler ved import**. Den skriver fil-nøkkelen inn i databasen,
også på typer som allerede finnes. Målt på tt02: én import ga 468 nøkkelendringer.

Committer du derfor en eksport tatt fra en annen database enn prod, skjer dette
ved neste oppstart i prod:

1. uSync gir prod-typene nøklene fra fila
2. Alt eksisterende innhold peker på de gamle nøklene
3. Hver eneste blokkmodul i prod blir «Unsupported»
4. Redaktørene ser tomme artikler, og innholdet kan ikke reddes ved å reversere
   koden, fordi composeren ikke setter nøkler i det hele tatt

## Den ene regelen

**En skjemaeksport som committes skal alltid være tatt fra prod.** Aldri fra en
lokal database, aldri fra tt02, aldri fra en fersk container.

Riktig framgangsmåte: prod backoffice → Settings → uSync → Export, hent filene fra
podden, commit dem.

## Hva som beskytter deg

`SchemaRekeyGuard` (`Composers/SchemaRekeyGuard.cs`) sammenligner fil-nøkler mot
databasens nøkler før hver import og **avbryter importen** hvis noen eksisterende
type ville fått ny nøkkel. Skjemaet står da urørt og siden kjører videre.

Guarden er en sikring, ikke en tillatelse. Den fanger feilen etter at den er
committet. Ikke bruk den som unnskyldning for å teste ting i prod.

Er re-nøkling faktisk tilsiktet, for eksempel for å aligne tt02 mot prod, settes
`USYNC_ALLOW_REKEY=true` som env-var i det miljøet. Den skal aldri settes i prod.

## Endringer som er trygge

Å legge til en ny type eller en ny property endrer ikke eksisterende nøkler.
Eksporter fra prod etterpå og commit. Guarden reagerer ikke, fordi ingenting
re-nøkles.
