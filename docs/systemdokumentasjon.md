# Systemdokumentasjon KI Norge

Denne siden oppsummerer utvikling og oppsett for ki.norge.no. Dokumentet er rettet mot utviklere og annet teknisk personell.

Relaterte dokumenter: [Hvordan legge ut nye versjoner (deploy)](deploy.md). Incident response runbook ligger hos prosjektleder.

Innholdsfortegnelse:

- [Cloudflare](#cloudflare)
  - [Domenenavn og DNS](#domenenavn-og-dns)
  - [SSL-terminering og sertifikater](#ssl-terminering-og-sertifikater)
  - [Sikkerhetsregler](#sikkerhetsregler)
  - [Sidemotor (portal / frontend)](#sidemotor-portal--frontend)
  - [Caching](#caching)
  - [Inngang til redaktørgrensesnittet](#inngang-til-redaktørgrensesnittet)
  - [Lansering og skjerming](#lansering-og-skjerming)
- [Altinn dis-core](#altinn-dis-core)
  - [Umbraco CMS](#umbraco-cms)
  - [Skjema og uSync](#skjema-og-usync)
  - [AzureSQL](#azuresql)
  - [Mediefiler](#mediefiler)
- [ElasticSearch](#elasticsearch)
- [Helsesjekk](#helsesjekk)
- [Miljøer i korthet](#miljøer-i-korthet)

## Cloudflare

### Domenenavn og DNS

ki.norge.no ligger under norge.no i Cloudflare som «Partial Setup (CNAME Setup)». Det vil si at DNS-records styres av norge.no-eier som før, ikke gjennom Cloudflare, og at utvalgte subdomener peker mot Cloudflare med CNAME.

Partial setup er ikke et valg vi tok av forsiktighet, men den eneste veien: Cloudflare krever apex-domene for å opprette en ny sone på Free, Pro og Business. Vi eier ikke apex-domenet norge.no, så full setup er ikke mulig for oss.

Hostnavn i bruk:

| Hostnavn | Peker på |
| --- | --- |
| `ki.norge.no` | frontend prod |
| `ki.test.norge.no` | frontend tt02 |
| `cms.ki.norge.no` | Umbraco prod |
| `cms.ki.test.norge.no` | Umbraco tt02 |

DNS-endringer på norge.no bestilles hos drift@digdir.no, som også eier domenet.

### SSL-terminering og sertifikater

Portal-adressene ligger som «custom hostnames» i Cloudflare med sertifikat «provided by Cloudflare». De utstedes av Google Trust Services og fornyes automatisk.

Hostnavnene er knyttet mot workere, og SSL-termineringen skjer før forespørselen treffer workeren.

### Sikkerhetsregler

Cloudflare gir automatisk beskyttelse mot DDoS. Sikkerhetshoder (CSP, HSTS og resten) settes av frontend selv i `apps/frontend/src/middleware.ts`, ikke i Cloudflare.

To rate limits er konfigurert i `wrangler.jsonc`:

- `TILTAK_LIMIT`: 5 forespørsler per 60 sekunder
- `SEARCH_LIMIT`: 60 forespørsler per 60 sekunder

### Sidemotor (portal / frontend)

Sidemotoren er en Astro-applikasjon i SSR-modus som kjører som worker i Cloudflare. Den henter data fra:

- Umbraco Delivery API v2 (innhold)
- ElasticSearch (søk)

Kode: `apps/frontend` i [digdir/ki.norge.no](https://github.com/digdir/ki.norge.no).

Kjørende workere: `ki-norge-frontend-prod` og `ki-norge-frontend-tt02`.

All datahenting ligger i `src/lib/umbraco.ts`. Der bor også `mapItem()`, som mapper innholdstyper fra API-et til TypeScript-typer. Skal du forstå hvor en verdi på en side kommer fra, start der.

### Caching

Assets (CSS, JS, bilder) lastes opp til Cloudflare ved deploy. Cloudflare cacher i tillegg statiske filer hentet fra Umbraco automatisk.

For caching av hele sider kjører en egen liten worker foran sidemotoren, `cache-kinorgeportal`. Den har en service-binding `FRONTEND` mot `ki-norge-frontend-<miljø>`, slår opp adressen i cache, og kaller sidemotoren bare når siden ikke ligger der. Ny side legges i cache før den leveres.

Kode: `apps/cache-kinorgeportal`. Workere: `cache-kinorgeportal-prod` og `cache-kinorgeportal-tt02`.

Cachen tømmes to steder:

- **Ved publisering i Umbraco.** CMS-et kaller Cloudflares REST-API når redaktøren publiserer.
- **Ved deploy.** Deploy-skriptet purger selv. Uten det kan edge-cachet HTML peke på en `_astro`-hash som ikke lenger finnes, og siden rendres ustylet.

### Inngang til redaktørgrensesnittet

Umbraco gjøres offentlig tilgjengelig gjennom en egen worker, `cms-kinorgeportal`, i stedet for direkte. Det gir DDoS-beskyttelse, og gjør at Delivery API er nåbart for våre workere uten å være åpent på Internett.

Kode: `apps/cms-kinorgeportal`. Workere: `cms-kinorgeportal-prod` og `cms-kinorgeportal-tt02`.

`workers_dev` **må** stå `true` for denne workeren. Workers.dev-hostnavnene bærer prod-media, og da de ble slått av falt bildene ut i ti minutter.

### Lansering og skjerming

`LAUNCH_MODE` styrer om et miljø er åpent. Den står `live` i begge nå. Skjermingen er fail-safe: et hostnavn i `GATED_HOSTS` (ki.norge.no og ki.test.norge.no) er skjermet med mindre `LAUNCH_MODE` eksplisitt er `live`. Workers.dev-adressene og localhost skjermes aldri.

`robots.txt` gir `Disallow: /` på alt som ikke er i `PROD_HOSTS`.

Admin-tilgang til skjermede miljøer og `/status` skjer via `/admin-tilgang?key=<ADMIN_SECRET>`, som setter en `ki_admin`-cookie i 30 dager.

## Altinn dis-core

### Umbraco CMS

Som publiseringsløsning bruker vi Umbraco CMS (versjon 17, .NET 10).

Kode: `apps/cms-umbraco` i [digdir/ki.norge.no](https://github.com/digdir/ki.norge.no).

Umbraco deployes som Docker-image til Kubernetes-clusteret «dis-core», som Altinns plattform-team gjør tilgjengelig for oss på Microsoft Azure. Navnerom er `product-kinorgeportal`. Utrullingen skjer med Flux fra et OCI-artefakt, ikke direkte fra GitHub Actions.

Umbraco i prod svarer på tre hostnavn, satt i `syncroot/prod/kustomization.yaml`:

- `kinorgeportal.prod.dis-core.altinn.cloud`
- `cms.ki.norge.no`
- `cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev`

`cms.ki.norge.no` er Umbracos `UmbracoApplicationUrl` og `BackOfficeHost`, så OAuth-retur lander der.

Pålogging til backoffice går via Entra ID. Nye brukere legges til med `pnpm run cms:add-user`.

**kubectl og dis-core-hostnavn krever Altinn-VPN.** Uten VPN når du Delivery API via workers.dev-proxyen, men ikke clusteret.

### Skjema og uSync

Dette er den viktigste enkeltdetaljen i CMS-oppsettet.

Skjemaet i drift eies av uSync, ikke av kode. Både `syncroot/prod` og `syncroot/tt02` setter `USYNC_OWNS_SCHEMA=true`, og da hopper `ContentTypeComposer` over hele skjema-assertingen. Composeren kjører fortsatt lokalt, der env-varen mangler.

Konsekvensen er lett å gå i: et nytt felt lagt til i composeren blir grønt lokalt og grønt i CI, og dukker aldri opp i prod.

Et nytt felt legges derfor til ved å redigere `.config`-fila under `apps/cms-umbraco/uSync/v17/ContentTypes/` i git. To regler gjelder:

- Egenskapene skal ligge **alfabetisk på Alias**.
- Filnavnet er aldri aliaset. Filnavnene er små bokstaver, aliasene camelCase (`forsideartikkelkort.config` inneholder aliaset `forsideArtikkelKort`, med stor K).

**Ikke regenerer `apps/cms-umbraco/uSync/`.** Filene der er prod sitt skjema og importeres ved hver oppstart. uSync re-nøkler ved import, og innholdstypene har tilfeldige GUID-er per database. En eksport tatt fra lokal maskin eller tt02 gir prod-typene nye nøkler og gjør alt blokkinnhold «Unsupported». `SchemaRekeyGuard` avbryter en slik import, men den er en sikring, ikke en tillatelse.

Etter en skjemaendring bør du måle at innholdet er intakt, ikke anta det. Tell blokker, innholdstyper og «Unsupported» før og etter mot Delivery API:

```
https://cms.ki.norge.no/umbraco/delivery/api/v2/content?take=200&expand=properties%5B%24all%5D
```

Er tallene like før og etter, ble ingenting re-nøklet.

Skjemaet hører altså hjemme i uSync-filene. **Innholdsnoder skal aldri skrives fra oppstartskode.** Det har gitt tre prod-hendelser. `ContentSeeder` er derfor fjernet helt, og demo- og testinnhold lages av redaktør.

### AzureSQL

Vi bruker managed AzureSQL. Den erstattet SQLite med Litestream, som ga lock-contention når flere redaktører jobbet samtidig.

Lokal utvikling bruker fortsatt SQLite. Connection string lokalt må bruke `|DataDirectory|` i stien, ikke en relativ sti, ellers finner ikke Umbraco databasen. I `appsettings.json` må connection string stå tom, slik at env-varen overstyrer.

Umbraco støtter kun SQLite og SQL Server. Ikke PostgreSQL.

### Mediefiler

Media ligger i Azure Blob Storage.

Fram til september 2026 ble media servert fra en Azure Files-PVC montert på `/app/wwwroot/media`. Blob var konfigurert riktig hele tiden, men ASP.NET static files serverte den frosne PVC-kopien før blob-provideren slapp til. Mounten er fjernet i `syncroot/base/umbraco/deployment.yaml`. Volumdeklarasjonen står igjen så PVC-en holder seg bundet.

Vil du vite hvilken kilde som faktisk serverer en fil, se på `last-modified` i svaret. Bytestørrelsen duger ikke, for de to kopiene kan være bit-identiske.

## ElasticSearch

Vi bruker Elastic Cloud via Microsoft Azure. Indeksen heter `ki-content`.

**Prod og tt02 deler samme cluster og indeks**, og den holder prod-innhold. Det er et bevisst valg, ikke en feilkonfigurasjon, men det er verdt å kjenne til: en reindeksering påvirker begge miljøer.

`ES_API_KEY` settes som worker-secret, ikke i `wrangler.jsonc`:

```
wrangler secret put ES_API_KEY --env prod
```

## Helsesjekk

`https://ki.norge.no/health` er punktet vakta skal overvåke. Formatet er det samme som `https://info.altinn.no/health`, så én regel på feltet `status` dekker begge portalene.

| `status` | HTTP | Betyr |
| --- | --- | --- |
| `Healthy` | 200 | Alt oppe |
| `Degraded` | 200 | Søket eller bildeadressen er nede, sidene rendres fortsatt |
| `Unhealthy` | 503 | CMS-et svarer ikke, eller svarer uten innhold |

Tre sjekker ligger bak:

- **`umbraco`** kaller Delivery API slik sidene gjør. Den regnes som nede også når API-et svarer 200 med tom liste, for slik ser det ut når en oppgradering hopper over migreringene.
- **`media`** kaller den offentlige CMS-adressen nettleseren henter bilder fra, i prod en proxy-worker. Den fanger et bildeutfall som #600, der alt annet svarte. Den finnes bare der den offentlige og den interne adressen er ulike, altså ikke på tt02.
- **`elasticsearch`** gjør et tomt søk med samme nøkkel som søket bruker.

Svaret viser bare status og tid, aldri adresser eller feilmeldinger. Detaljene står på `/status`, som krever admin-cookie.

Resultatet gjenbrukes i 15 sekunder. Når det går ut, oppdaterer én forespørsel mens de andre får forrige resultat, så det blir én runde kall mot CMS og søk per 15 sekunder per isolat, uansett hvor mange som spør. Unntaket er et nytt isolat som ennå ikke har noe resultat å vise.

`/api/health` og `/api/health/ready` er eldre adresser som svarer det samme som `/health`, med samme resultat.

## Miljøer i korthet

| | prod | tt02 |
| --- | --- | --- |
| Frontend | `ki-norge-frontend-prod` | `ki-norge-frontend-tt02` |
| Cache-worker | `cache-kinorgeportal-prod` | `cache-kinorgeportal-tt02` |
| CMS-worker | `cms-kinorgeportal-prod` | `cms-kinorgeportal-tt02` |
| Portal | ki.norge.no | ki.test.norge.no |
| Umbraco | cms.ki.norge.no | cms.ki.test.norge.no |
| Database | AzureSQL | AzureSQL |
| Kubernetes | `dis-core-prod-aks` | `dis-core-tt02-aks` |

Skjema speiles automatisk til begge miljøer gjennom uSync. **Innhold speiles ikke.** Kopiering av innhold fra prod til tt02 er en manuell enveisjobb.
