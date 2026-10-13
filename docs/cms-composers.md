# Composers i CMS-et

Umbraco finner og laster alle klasser som implementerer `IComposer` ved oppstart, uansett hvilken mappe de ligger i. Det finnes ingen liste å melde dem inn i. Men ikke alle gjør noe i drift. Noen registrerer seg bare når konfigurasjonen finnes, og én reagerer på en innholdstype som ikke finnes.

I drift betyr her prod og tt02. Konfigurasjonen kommer fra tre steder:

- `apps/cms-umbraco/appsettings.json`, med tomme standardverdier
- env-variabler i `syncroot/`, felles i `base/` og per miljø i `prod/` og `tt02/`
- miljøets Key Vault, der nøkkelen skrives med `--` i stedet for `:`, for eksempel `Cloudflare--ApiToken` for `Cloudflare:ApiToken`

Key Vault leses bare ved oppstart, så en ny eller endret verdi krever en ny pod. Feiler lastingen, logger `Program.cs` feilen og starter uten verdiene. Composerne som trenger dem, blir da stille inaktive.

## Oversikt

| Composer | Mappe | Prod | tt02 | Slås på av |
|---|---|---|---|---|
| `ContentTypeComposer` | `Composers/` | Nei | Nei | Mangler `USYNC_OWNS_SCHEMA=true`. Kjører lokalt og i CI |
| `SchemaRekeyGuardComposer` | `Composers/` | Ja | Ja | Alltid. Virker ved hver uSync-import |
| `SchemaOriginStampComposer` | `Composers/` | Ja | Ja | Alltid. Virker bare ved eksport for hånd |
| `ContentSlugComposer` | `Composers/` | Ja | Ja | Alltid |
| `MerkelappSlugComposer` | `Composers/` | Nei | Nei | Innholdstypen `merkelapp`, som ikke finnes |
| `VeiledningStegGuideSlugComposer` | `Composers/` | Ja | Ja | Alltid |
| `UrlFieldWashComposer` | `Composers/` | Ja | Ja | Datatypen «Lenke / URL» |
| `NbspWashComposer` | `Composers/` | Ja | Ja | Alltid |
| `SandkasseSingleInstanceComposer` | `Composers/` | Ja | Ja | Alltid |
| `AdminProtectionComposer` | `Composers/` | Ja | Ja | Alltid |
| `NorwegianIdentityErrorDescriberComposer` | `Composers/` | Ja | Ja | Alltid. Gjelder lokale passord |
| `HeadlessPreviewComposer` | `Composers/` | Ja | Ja | `HeadlessPreview:FrontendUrl` og `HeadlessPreview:PreviewSecret` |
| `AzureBlobMediaComposer` | `Composers/` | Ja | Ja | `Umbraco:Storage:AzureBlob:Media:ConnectionString` |
| `MicrosoftEntraIdBackOfficeExternalLoginComposer` | `CustomAuthentication/` | Ja | Ja | Fire `MicrosoftEntraId`-verdier, eller `MicrosoftEntraId:Enabled` |
| `CachePurgeComposer` | `CachePurge/` | Ja | Se under | `Cloudflare:ApiToken`, `Cloudflare:ZoneId` og `Cloudflare:SiteBaseUrl` |
| `SearchComposer` | `Search/` | Ja | Nei, med vilje | `Elasticsearch:Endpoint` |
| `MalformComposer` | `Malform/` | Ja | Ja | Alltid |
| `OpenTelemetryComposer` | `Telemetry/` | Ja | Ja | `OTEL_EXPORTER_OTLP_ENDPOINT` |

`InternalUrlWasher.cs` ligger i `Composers/`, men er en hjelpeklasse for `UrlFieldWashHandler` og ikke en composer.

Tre av composerne henger sammen. `MalformComposer` bruker tekstuttrekket som `SearchComposer` registrerer, og tekstuttrekket bruker `ContentRouteResolver`, som bare `HeadlessPreviewComposer` registrerer. Fjernes `SearchComposer`, slutter målformrapporten å virke. Fjernes `HeadlessPreviewComposer`, slutter også indekseringen å virke.

## Skjema og uSync

### ContentTypeComposer

`Composers/ContentTypeComposer.cs`

**Gjør.** Oppretter og migrerer innholdstyper, elementtyper og datatyper ved oppstart. Hvert steg kjører for seg, så en feil i ett steg logges og resten fortsetter.

**I drift.** Nei. Composeren stopper når `USYNC_OWNS_SCHEMA=true`, og det er satt i både `syncroot/prod` og `syncroot/tt02`. Skjemaet i drift kommer fra `.config`-filene under `apps/cms-umbraco/uSync/v17/`, som uSync importerer ved oppstart (`uSync__Settings__ImportAtStartup`). Composeren kjører bare lokalt og i CI.

**Feller.**

- CI starter CMS-et med `dotnet run`, uten `USYNC_OWNS_SCHEMA` og med `ImportAtStartup: None` fra `appsettings.json`. Ingen uSync-import skjer. Ende-til-ende-testene kjører derfor mot composerens skjema, ikke mot prods.
- Et felt lagt til her blir grønt lokalt og i CI, men kommer aldri til prod. Nye felt legges i uSync-filene, se «Skjema og uSync» i [systemdokumentasjon.md](systemdokumentasjon.md).
- Oppryddingen av utgåtte typer sletter typene og alle nodene deres for godt, ved hver oppstart der composeren kjører. Start aldri CMS-et uten `USYNC_OWNS_SCHEMA=true` mot en kopi av en ekte database.

### SchemaRekeyGuardComposer

`Composers/SchemaRekeyGuard.cs`

**Gjør.** Registrerer to handlere rundt uSync-importen.

- `SchemaRekeyGuard` sammenligner nøkkelen i hver `.config`-fil under `ContentTypes/` og `DataTypes/` med nøkkelen i databasen før importen starter. Ville importen gitt en eksisterende type ny nøkkel, stoppes den. Blokkinnhold refererer typer på nøkkel, så en slik import gjør alt blokkinnhold «Unsupported».
- `SchemaImportReporter` logger på Error-nivå og til stderr når en import endret noe. Null endringer er normaltilstanden og logges ikke.

**I drift.** Ja, ved importen ved hver oppstart og ved import fra backoffice.

**Feller.**

- uSync 17.3.6 respekterer ikke `Cancel`, så guarden kaster et unntak for å stoppe importen.
- `USYNC_ALLOW_REKEY=true` slipper en re-nøkling gjennom med en advarsel. Bruk den bare når re-nøklingen er tilsiktet.
- Etter en ønsket skjemaendring logger første oppstart endringen på Error-nivå. Det er forventet.

### SchemaOriginStampComposer

`Composers/SchemaOriginStamp.cs`

**Gjør.** Skriver `uSync/v17/.origin` etter en uSync-eksport, med miljøet, `UmbracoApplicationUrl` og tidspunktet. Miljøet utledes av `UmbracoApplicationUrl`. `scripts/check-usync-schema.sh` i CI avviser en PR der `.origin` ikke sier `prod`.

**I drift.** Registrert i begge miljøene, men virker bare når noen eksporterer for hånd fra uSync i backoffice. `ExportOnSave` og `ExportAtStartup` står på `None`.

**Feller.**

- Merket skrives ved alle eksporter så lenge `ContentTypes/` finnes, og i drift ligger den alltid i imaget. Også en ren innholdseksport får merket.

## Ved lagring av innhold

### ContentSlugComposer

`Composers/ContentSlugHandler.cs`

**Gjør.** Vasker `slug` til en URL-vennlig verdi ved lagring, for alle innholdstyper som har feltet. Er feltet tomt, lages slug fra `tittel`, ellers fra nodenavnet. Æ, ø og å blir e, o og a.

**I drift.** Ja.

**Feller.**

- Translitterasjonen avviker fra Umbracos standard (ae, oe, aa). Andre steder som bruker Umbracos hjelper direkte, gir andre slugs for samme tekst.
- `merkelapp` hoppes over, fordi `MerkelappSlugComposer` var ment å eie den.

### MerkelappSlugComposer

`Composers/MerkelappSlugHandler.cs`

**Gjør.** Setter `slug` fra `navn` når en node av typen `merkelapp` lagres.

**I drift.** Nei. Innholdstypen `merkelapp` finnes ikke i uSync-skjemaet. Lokalt sletter `ContentTypeComposer` den i oppryddingen. Merkelappene på eksemplene er Tags-felt fra [#792](https://github.com/digdir/ki.norge.no/pull/792). Handleren har ingenting å reagere på noe sted.

### VeiledningStegGuideSlugComposer

`Composers/VeiledningStegGuideSlugHandler.cs`

**Gjør.** Setter `guideSlug` på et `veiledningSteg` til slug-en til `veiledningGuide`-noden det ligger under. Feltet skrives over ved hver lagring.

**I drift.** Ja. Frontenden bygger stegnavigasjonen fra `guideSlug`, og cache-purgen bruker den til å finne stegets URL.

**Feller.**

- Handleren kjører når steget lagres, ikke når guiden lagres. Endres slug-en på en guide, beholder stegene den gamle til de lagres på nytt.

### UrlFieldWashComposer

`Composers/UrlFieldWashHandler.cs` og `Composers/InternalUrlWasher.cs`

**Gjør.** Vasker alle felt med datatypen «Lenke / URL» ved lagring, også inne i Block List og Block Grid og i blokker i blokker. Bare interne stier vaskes. De får én skråstrek først, ingen til slutt, ingen doble og ingen mellomrom. Eksterne URL-er, ankre og domener uten skjema blir bare trimmet.

**I drift.** Ja. 11 innholdstyper i uSync-skjemaet bruker datatypen.

**Feller.**

- Datatypen finnes igjen på navnet «Lenke / URL». Får den et annet navn, slutter vaskingen uten feilmelding.
- Et lenkefelt blir bare vasket hvis det bruker denne datatypen, ikke en vanlig tekststreng.

### NbspWashComposer

`Composers/NbspWashHandler.cs`

**Gjør.** Bytter hardt mellomrom (U+00A0, `&nbsp;`, `&#160;` og `&#xA0;`) med vanlig mellomrom ved lagring. Gjelder tekst-, tekstområde- og RichText-felt og hele Block List- og Block Grid-verdier.

**I drift.** Ja.

**Feller.**

- Bare det som lagres etter at handleren kom med, blir vasket. Eldre noder vaskes når de lagres på nytt. Frontenden normaliserer hardt mellomrom ved visning uansett.
- Også harde mellomrom satt med vilje, som i «10 000», blir vanlige mellomrom.

### SandkasseSingleInstanceComposer

`Composers/SandkasseSingleInstanceHandler.cs`

**Gjør.** Stopper lagring av en ny `sandkasse`-node når det finnes en fra før, med en feilmelding til redaktøren. Frontenden har bare én `/sandkasse`.

**I drift.** Ja.

**Feller.**

- En sandkasse i papirkurven teller ikke. Upubliserte gjør det.

## Backoffice og brukere

### MicrosoftEntraIdBackOfficeExternalLoginComposer

`CustomAuthentication/`

**Gjør.** Gir «Microsoft»-knappen på innloggingen til backofficet. En ny bruker kobles og godkjennes automatisk ved første innlogging. Ved hver innlogging settes Umbraco-gruppene fra app-rollene i Entra ID, der `umbraco-admin` gir `admin` og `umbraco-redaktor` gir `editor`. Uten en av rollene nektes innloggingen. Nye brukere legges til med `pnpm run cms:add-user`.

**I drift.** Ja i begge miljøene. Slås på når `MicrosoftEntraId:ClientId`, `ClientSecret`, `Authority` og `CallbackPath` finnes, i Key Vault som `MicrosoftEntraId--ClientId` osv. `MicrosoftEntraId:Enabled` overstyrer. `false` slår innloggingen av, og `true` krever alle fire verdiene.

**Feller.**

- `Enabled=true` med en verdi som mangler, stopper oppstarten.
- Grupper satt for hånd i backofficet skrives over ved neste innlogging. Tilgang styres i Entra ID.
- Lokal passordinnlogging er fortsatt på ved siden av (`DenyLocalLogin = false`).
- En bruker som er deaktivert i Umbraco, blir ikke aktivert igjen ved innlogging.

### AdminProtectionComposer

`Composers/AdminProtectionHandler.cs`

**Gjør.** Stopper sletting av brukeren `admin@ki.norge.no`, så ingen kan låse alle ute ved å slette den eneste administratoren.

**I drift.** Ja.

**Feller.**

- Skal kontoen byttes, endres `ProtectedAdminEmail` i koden og rulles ut før endringen gjøres i backofficet.

### NorwegianIdentityErrorDescriberComposer

`Composers/NorwegianIdentityErrorDescriber.cs`

**Gjør.** Erstatter de engelske feilmeldingene for passordregler med norske, så backofficet for eksempel viser «Passordet må være minst 10 tegn.» i stedet for «Unknown failure».

**I drift.** Ja, for kontoer med lokalt passord. Brukere som logger inn med Entra ID, har ikke passord i Umbraco.

**Feller.**

- Bare passordmeldingene er oversatt. Andre feil fra ASP.NET Identity, som utestenging, er på engelsk.

### HeadlessPreviewComposer

`Composers/HeadlessPreviewUrlProvider.cs`

**Gjør.** Lager forhåndsvisningslenken i backofficet: `HeadlessPreview:FrontendUrl`, stien fra `content-routes.json` og `?preview=true&secret=` med `HeadlessPreview:PreviewSecret`. Registrerer også `ContentRouteResolver`, som søket og målformrapporten bruker.

**I drift.** Ja. `HeadlessPreview__FrontendUrl` settes per miljø i `syncroot/`. `HeadlessPreview:PreviewSecret` står ikke i repoet og kommer fra miljøets Key Vault.

**Feller.**

- Mangler `FrontendUrl`, peker lenken på `http://localhost:4321`.
- `PreviewSecret` må være lik `PREVIEW_SECRET` i frontend-workeren. Ellers ser redaktøren bare publisert innhold.
- `content-routes.json` speiles fra frontenden med `scripts/sync-content-routes.js`. En innholdstype uten rute får meldingen «Forhåndsvisning er ikke tilgjengelig».

### MalformComposer

`Malform/`

**Gjør.** Registrerer rapporten bak dashbordet «Målform» i Innhold, som viser hvor mye av det publiserte innholdet som er nynorsk. Dashbordet ligger i `App_Plugins/Malform/` og henter rapporten fra `/umbraco/management/api/v1/malform`.

**I drift.** Ja, for alle med tilgang til Innhold-seksjonen.

**Feller.**

- Rapporten bruker tekstuttrekket fra `SearchComposer`, se kjeden over.
- Rapporten regnes ut på nytt ved hvert kall, over alt publisert innhold.

## Integrasjoner

### AzureBlobMediaComposer

`Composers/AzureBlobMediaComposer.cs`

**Gjør.** Legger media i Azure Blob Storage når `Umbraco:Storage:AzureBlob:Media:ConnectionString` er satt. Ellers ligger media i `wwwroot/media` på disk. Podden autentiserer med workload identity, så `ConnectionString` er endepunktet til lagringskontoen og ikke en nøkkel.

**I drift.** Ja i begge miljøene. `ConnectionString` og `ContainerName` settes per miljø i `syncroot/`.

**Feller.**

- Fjernes `ConnectionString`, legger CMS-et media på disk i podden uten feilmelding. Linja `[Media] Lagring: …` ved oppstart sier hvilken lagring som brukes.
- Hvilken kilde som serverer en fil, ser du på `last-modified`, se «Mediefiler» i [systemdokumentasjon.md](systemdokumentasjon.md).

### CachePurgeComposer

`CachePurge/`

**Gjør.** Ved publisering, avpublisering og flytting til papirkurven finner `FrontendUrlResolver` frontend-URL-ene som berøres, ut fra innholdstype og slug, og purger dem i Cloudflare i bakgrunnen. Globale innstillinger, en innholdstype uten URL-regel, en feil i utregningen eller flere URL-er enn `AffectedUrlThreshold` (30) gir purge av alt. Ved oppstart logges om token og sone er satt.

**I drift.** Ja i prod. Purgen krever alle tre verdiene: `Cloudflare:ApiToken` og `Cloudflare:ZoneId` fra Key Vault (`Cloudflare--ApiToken`, `Cloudflare--ZoneId`) og `Cloudflare:SiteBaseUrl`, som settes per miljø i `syncroot/`. Om tt02 har token og sone, viser logglinja ved oppstart der: `Cloudflare cache-purge: Enabled=…, ZoneId=<satt>, ApiToken=<satt>`. Se også [cloudflare-cache-purge.md](cloudflare-cache-purge.md).

**Feller.**

- ki.norge.no og ki.test.norge.no ligger i samme Cloudflare-sone. Purge av alt treffer derfor begge miljøene.
- Purgen kjører etter at lagringen er ferdig. En feil logges, men redaktøren ser en vellykket lagring.
- Uten `SiteBaseUrl` purges ingenting, heller ikke ved endringer i globale innstillinger.
- En ny innholdstype uten URL-regel i `FrontendUrlResolver` gir purge av alt ved hver publisering.

### SearchComposer

`Search/`

**Gjør.** Legger publisert innhold inn i Elasticsearch-indeksen `ki-content` ved publisering, og fjerner det ved avpublisering og flytting til papirkurven. Registrerer også en bakgrunnsjobb og en rute i backofficet for full reindeksering, `search/reindex`, som krever administrator.

**I drift.** Ja i prod. På tt02 er søket av med vilje. Prod og tt02 deler cluster og indeks, og den holder prod-innhold, så CMS-et på tt02 har ikke `Elasticsearch:Endpoint`. Uten endepunkt indekseres ingenting, og det logges en advarsel. Endepunkt og nøkkel står ikke i repoet og kommer fra miljøets Key Vault (`Elasticsearch--Endpoint`, `Elasticsearch--ApiKey`).

**Feller.**

- Søket på tt02 viser prod-innhold.
- En reindeksering påvirker begge miljøene.
- Målformrapporten bruker tekstuttrekket herfra, også på tt02, der indekseringen er av.

### OpenTelemetryComposer

`Telemetry/OpenTelemetryComposer.cs`

**Gjør.** Sender spor over OTLP til `otel-collector` i klyngen. Kall til backofficet, management-API-et, forhåndsvisning, statiske filer, media og `/api/health` tas ikke med. Det gjør heller ikke utgående kall til Key Vault, lagring, Microsoft-innlogging, Umbracos egne tjenester og Cloudflare-API-et.

**I drift.** Ja i begge miljøene. `OTEL_EXPORTER_OTLP_ENDPOINT` settes i `syncroot/base/umbraco/deployment.yaml`. Lokalt er den ikke satt, og composeren gjør ingenting.

**Feller.**

- Loggene går ikke gjennom denne composeren, men gjennom Serilog-sinken i `appsettings.Production.json`. Umbraco tømmer logg-providerne ved oppstart, så en logg-provider registrert her ville forsvunnet.
