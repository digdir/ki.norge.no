# Hvordan legge ut nye versjoner (deploy)

Oppskrift for å legge ut nye versjoner etter at kode er endret.

- [Frontend (ki-norge-frontend)](#frontend-ki-norge-frontend)
- [Umbraco CMS](#umbraco-cms)
- [Cache-worker (cache-kinorgeportal)](#cache-worker-cache-kinorgeportal)
- [CMS-worker (cms-kinorgeportal)](#cms-worker-cms-kinorgeportal)
- [Rekkefølge når flere deler endres](#rekkefølge-når-flere-deler-endres)

Alt deployes fra `main`. Frontend-skriptene nekter å kjøre fra en annen branch, med skittent arbeidstre, eller når du ikke er i synk med origin.

## Frontend (ki-norge-frontend)

Etter endringer i sidemotoren legges nye versjoner ut fra kommandolinjen lokalt.

1. Sjekk at endringene er merget til `main` i GitHub.
2. Hent siste endringer lokalt.
3. Deploy:

```bash
pnpm run frontend:deploy:tt02
pnpm run frontend:deploy:prod
```

Skriptet bygger, deployer og tømmer Cloudflare-cachen for miljøet. Du trenger ikke purge manuelt.

Er du ikke innlogget i Cloudflare-kontoen til Digitaliseringsdirektoratet, blir du bedt om det.

Deploy til tt02 først når endringen er synlig for brukere. Begge miljøer er åpne, så en feil i prod er en feil publikum ser.

### Verifisere at riktig versjon kjører

Deploy-utskriften gir en `Version ID`, men den sier bare at opplastingen gikk bra. Vil du vite at endringen faktisk er ute, se etter en markør du vet er ny, med cache-buster:

```bash
curl -s "https://ki.norge.no/artikler?cb=$RANDOM" | grep -o "noe-du-vet-er-nytt"
```

Cache-buster er obligatorisk bak Cloudflare. Uten den kan du måle en cachet kopi av forrige versjon.

## Umbraco CMS

Endringer i Umbraco krever to steg: bygge et image, og rulle det ut. Et grønt bygg betyr ikke at noe er rullet ut.

### 1. Bygg nytt image

1. Sjekk at endringene er merget til `main`.
2. Finn forrige versjonsnummer på [Publish Syncroot artifacts](https://github.com/digdir/ki.norge.no/actions/workflows/publish-syncroot-main.yaml).
3. Kjør [Docker build and publish](https://github.com/digdir/ki.norge.no/actions/workflows/docker-publish.yaml) med neste nummer og et stikkord, for eksempel `63-adressefelt`.

Imaget lastes opp til ghcr.io.

Feiler jobben, les output før du gjør noe annet. Ikke alle feil er dine: cosign-installasjonen henter fra GitHubs release-CDN, og en 504 derfra stopper bygget uten at det er noe galt med koden. Da holder det å kjøre på nytt.

### 2. Rull ut

1. Kjør [Publish Syncroot artifacts](https://github.com/digdir/ki.norge.no/actions/workflows/publish-syncroot-main.yaml).
2. Velg miljø, angi versjonsnummeret fra steg 1, og velg **AzureSQL** som database.

Velger du Sqlite her, peker du et miljø med ekte data mot feil database.

Workflowen publiserer et artefakt. Flux plukker det opp på et femminuttersintervall, så det tar noen minutter før podden faktisk rulles. **En grønn workflow beviser ikke at utrullingen er skjedd.**

### 3. Verifiser

Med VPN:

```bash
kubectl get pods -n product-kinorgeportal
```

Uten VPN er den mest direkte målingen å be Delivery API om noe du vet er nytt. La en skjemaendring være beviset på seg selv:

```bash
curl -s "https://cms.ki.norge.no/umbraco/delivery/api/v2/content?take=200&expand=properties%5B%24all%5D" \
  | grep -c "ditt-nye-felt"
```

Går det fra 0 til et tall, er både utrullingen og uSync-importen gjennomført. Midt i rullingen svarer API-et tomt et øyeblikk, det er normalt.

Backoffice-hashen duger **ikke** til å se om podden rullet. Den speiler bare Umbraco-versjonen. Vil du måle imaget uten VPN, bruk `Last-Modified` på en fil under `App_Plugins`. Det er byggetidspunktet for imaget.

### 4. Sjekk at innholdet er intakt

Etter en skjemaendring: tell blokker, innholdstyper og «Unsupported» i Delivery API før og etter. Er tallene like, ble ingenting re-nøklet. Er antall «Unsupported» over null, stopp og se på uSync-nøklene før du gjør noe mer.

## Cache-worker (cache-kinorgeportal)

Etter endringer i hva som caches:

```bash
pnpm run cache-kinorgeportal:deploy:tt02
pnpm run cache-kinorgeportal:deploy:prod
```

Fjern sider som ikke lenger skal caches manuelt fra Cloudflare etterpå.

Unngå å tømme hele cachen for ki.norge.no på dagtid.

## CMS-worker (cms-kinorgeportal)

Etter endringer i inngangsporten til redaktørgrensesnittet:

```bash
pnpm run cms-kinorgeportal:deploy:tt02
pnpm run cms-kinorgeportal:deploy:prod
```

Test at pålogging til `https://cms.ki.norge.no/umbraco` fungerer etterpå.

Sjekk samtidig at bilder fortsatt lastes på forsiden. Workers.dev-hostnavnene bærer prod-media, og `workers_dev` må stå `true` for denne workeren. Da den ble slått av, falt bildene ut i ti minutter.

## Rekkefølge når flere deler endres

Endrer du både skjema og frontend i samme runde, ta CMS først. Frontend som leser et felt som ikke finnes ennå, viser tomt. CMS som har et felt ingen leser, viser ingenting galt.

1. Bygg og rull ut CMS-image til tt02, verifiser
2. Samme til prod, verifiser
3. Frontend til tt02, så prod

## Vanlige feil

**Innlogging i backoffice går i sløyfe etter deploy.** Serveren er som regel frisk. Prøv privat vindu først, og tøm localStorage.

**Siden er ustylet etter deploy.** Edge-cachet HTML peker på en `_astro`-hash som er slettet. Riktig fiks er purge, som deploy-skriptet gjør selv.

**Et felt lagt til i `ContentTypeComposer` dukker ikke opp i prod.** Det skal det ikke. Composeren er avslått i drift. Se [Systemdokumentasjon](systemdokumentasjon.md#skjema-og-usync).
