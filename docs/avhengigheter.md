# Avhengigheter

Hvor avhengighetene i repoet bor, hvordan de oppdateres, fellene fra tidligere runder, og oppskriftene for å oppdatere og verifisere. Del 1 til 5 er varige. Del 6 er runden som gjelder nå, og skrives om ved hver gjennomgang.

Sist gjennomgått 2026-09-28. Fase 0, 1.1, 1.2 og deler av 4 er gjort samme dag.

## 1. Hvor avhengighetene bor

| Område | Fil | Oppdateres av | Kommer i drift når |
| --- | --- | --- | --- |
| Frontend (npm) | `apps/frontend/package.json`, `pnpm-lock.yaml` | Renovate, rutinen merger | Neste `frontend:deploy:tt02` / `:prod` (manuell) |
| Rot-verktøy (npm) | `package.json` (wrangler, `@digdir/designsystemet` for tokens, cross-env, `packageManager` = pnpm) | Renovate | Ikke i drift. Wrangler brukes ved deploy |
| Sikkerhetsgulv (npm) | `pnpm-workspace.yaml` under `overrides` | For hånd. Renovate lager ikke major-PR for dem | Sammen med frontend |
| Cache-worker | `apps/cache-kinorgeportal/package.json` | Renovate | Bare ved manuell `cache-kinorgeportal:deploy:tt02` / `:prod` |
| CMS-proxy | `apps/cms-kinorgeportal/` (ingen package.json, bruker rotens wrangler) | Ingen | Bare ved manuell `cms-kinorgeportal:deploy:tt02` / `:prod` |
| CMS (NuGet) | `apps/cms-umbraco/KiNorge.Cms.csproj` | Renovate («nuget non-major»), rutinen merger | Nytt CMS-image, så «Publish Syncroot artifacts» |
| Base-image | `apps/cms-umbraco/Dockerfile` (`dotnet/aspnet` og `dotnet/sdk` 10.0, låst med digest) | Renovate (digest-PR) | Nytt CMS-image |
| GitHub Actions | `.github/workflows/*.yml` (låst med SHA) | Renovate og Dependabot, begge (se fase 4) | Straks ved merge |
| Verktøykjede | Node 24 (`setup-node`), .NET SDK 10.0.x (`setup-dotnet`), `ubuntu-latest` | For hånd | Straks |
| Workers-runtime | `compatibility_date` i hver `wrangler.jsonc` | For hånd | Ved deploy av den workeren |

## 2. Slik går det i dag

- **Renovate** bruker det delte oppsettet `digdir/renovate-config` (bygger på `config:recommended`). Det kjører torsdager før 07:00 og krever at en versjon er tre dager gammel. Minor og patch samles i én PR per økosystem («npm non-major dependencies», «nuget non-major dependencies»). Docker og Actions låses med digest. Våre egne regler står i `renovate.json`. Status for alt ligger i Dependency Dashboard (issue #214).
- **pnpm** krever i tillegg at en versjon er 24 timer gammel (`minimumReleaseAge: 1440` i `pnpm-workspace.yaml`). Det blokkerer hardt, ikke bare med en advarsel.
- **Dependabot** lager sikkerhets-PR-er for npm (repo-innstilling) og månedlige PR-er for Actions (`.github/dependabot.yml`).
- **Rutinen** er en launchd-jobb på Lars' Mac (`no.digdir.ki-norge.dep-routine`), som kjører morgen og ettermiddag. Den merger minor, patch og digest på grønn CI, og flagger major og runtime. Loggen ligger i `~/projects/TODO/Avhengigheter-logg.md`. Den kjører bare når Mac-en er våken.

Dette gjør ingen av dem:

- deployer. Frontend, CMS-image og de to små workerne må ut for hånd
- tar major-versjoner
- tester en Umbraco- eller uSync-oppgradering mot en prod-lik database
- rydder i overrides som ikke lenger trengs
- ser sårbarheter i utviklingsavhengigheter (Trivy hopper over dem, `pnpm audit` gjør det ikke)
- flytter `compatibility_date`, Node-major, .NET-major eller CI-runnerens OS

## 3. Feller fra tidligere runder

- **Astro-major kommer ufullstendig fra bot.** `astro`, `@astrojs/cloudflare`, `@astrojs/node` og `@astrojs/react` må flyttes sammen, og Node-kravet sjekkes (#618).
- **Astro-patch kan heve gulv som overrides skjuler.** 7.2.9 krevde `sharp ^0.35.4`, og overriden vår ville vunnet stille. `@cloudflare/vite-plugin` sjekker wrangler-versjonen ved bygg, ikke ved install (#728).
- **Overrides leses bare fra `pnpm-workspace.yaml`, og vinner stille over hver pakkes versjonskrav.** En override fjernes bare når løst versjon er målt før og etter (#791 nanoid). Major-bump av overrides er slått av i `renovate.json`.
- **Aldri `minimumReleaseAgeExclude` for å komme forbi ventetiden.** Det skrur av en vakt mot forsyningskjedeangrep. Vent, eller ta forrige patch.
- **Microsoft.OpenApi 3 brekker swagger ved kjøring mens CI er grønn** (#742). Pinnene på Microsoft.OpenApi og SQLitePCLRaw i csproj løfter transitive pakker over Umbracos eget gulv og må bli (#791).
- **Umbraco-minor kan inneholde migreringer som skriver om innhold**, som 17.5 som skrev om lenker i riktekst. `UpgradeUnattended=true` ligger i `appsettings.json` (#595). Uten den svarer Delivery API 200 med tom liste.
- **uSync kan re-nøkle ved import.** Da blir alt blokkinnhold «Unsupported». `SchemaRekeyGuard` stopper importen, men hver uSync-versjon må måles (oppskrift 5.5). Regenerer aldri `apps/cms-umbraco/uSync/`.
- **CMS-deploy.** Hver deploy trenger en ny image-tag (`imagePullPolicy: IfNotPresent`). Deployen er `Recreate` med én pod, som gir ca. 45 sekunders nedetid. Velg alltid `database=AzureSQL`. En grønn workflow betyr ikke at podden har rullet (Flux bruker noen minutter).
- **Workers.** `fetch` kalt som metode (`deps.fetch()`) kaster «Illegal invocation». `Date.now()` er 0 i modul-scope. Cache-workeren slår opp på URL alene.
- **Frontend-deploy krever ren main i sync med origin.** Kjøres fra primær-checkouten.
- **Rull aldri CMS under image 69.** Tagger, ingress og virksomhet forsvinner da med verdiene sine (uSync `RemoveProperties`).

## 4. Rekkefølge og porter

1. **Én ting per PR.** Hvert økosystem og hver major får sin egen PR, så en feil kan spores og rulles tilbake alene.
2. **Grønn CI er ikke nok.** Hver PR får verifiseringen for sitt område i del 5.
3. **tt02 før prod,** med samme image-tag og samme main-commit.
4. **Baseline før, måling etter.** Tall, ikke inntrykk.
5. **Stopp og spør Lars** ved alt som står i del 7.

## 5. Oppskrifter

### 5.1 Før du starter

```sh
cd ~/projects/ki.norge.no && git fetch origin && git status --short   # skal være tom
git worktree add ../ki-norge-working-trees/<navn> -b <branch> origin/main
cd ../ki-norge-working-trees/<navn> && pnpm install --frozen-lockfile
```

Branch-arbeid gjøres alltid i et arbeidstre. Primær-checkouten brukes bare til deploy.

Baseline i begge miljø:

```sh
node scripts/cms-telling.mjs cms.ki.norge.no
node scripts/cms-telling.mjs cms.ki.test.norge.no
pnpm run audit:layout                          # prod, alle URL-er i sitemapet
curl -s https://ki.norge.no/health             # "status": "Healthy"
```

Status for base-image og sårbarheter:

```sh
node scripts/dotnet-image-versjon.mjs              # .NET i låst digest mot dagens tag
trivy fs . --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --skip-dirs .git,node_modules,.playwright-cli
pnpm audit --audit-level high                  # tar med utviklingsavhengigheter
dotnet list apps/cms-umbraco package --vulnerable --include-transitive
```

### 5.2 npm i frontend

```sh
pnpm --filter ki-norge-frontend run test:unit
pnpm --filter ki-norge-frontend run build
pnpm run frontend:dev:prod                     # lokal frontend mot prod-CMS på port 4321
pnpm run audit:layout http://localhost:4321    # samme sjekk som baseline, mot lokal
```

- **Designsystemet og aksel-ikoner** kan endre CSS. Sammenlign forsiden, `/artikler`, `/eksempler`, en eksempelside, `/veiledning`, `/kalender`, `/ki-tiltak` og `/om-oss` i 375, 768 og 1280 før og etter, med skjermbilder, og se på dem.
- **Øyene** (React) testes i nettleseren: søket åpner og gir treff, et KI-tiltak åpnes fra lista, og fanene på `/kalender` bytter.
- **Etter deploy til tt02:** `pnpm run audit:layout https://ki.test.norge.no`, og de samme øyene.
- **Stopp dev-serveren.** Astro 7 starter den løsrevet: `pnpm exec astro dev stop` fra `apps/frontend`. Sjekk at porten er fri med `lsof -nP -iTCP:4321 -sTCP:LISTEN`, og drep PID-en den viser om noe står igjen.

### 5.3 Cache-worker og CMS-proxy

```sh
pnpm --filter cache-kinorgeportal exec vitest run          # testene kjører ikke i CI
pnpm --filter cache-kinorgeportal exec wrangler deploy --env tt02 --dry-run
```

Deploy fra primær-checkouten på ren main: `pnpm run cache-kinorgeportal:deploy:tt02` og `pnpm run cms-kinorgeportal:deploy:tt02`, deretter `:prod`. Skriptene sjekker ikke at main er ren, så gjør det først.

Sjekk etter deploy:

- **Cache-workeren lagrer ikke no-store.** Mål på innholdet, ikke på `Date`. Cloudflare setter ny `Date` også på svar fra Cache API, så like `Date` beviser ingenting. Hent `/health` to ganger med 20 sekunders mellomrom: svaret skal være ulikt, siden varighetene endrer seg. Hent forsiden to ganger: `news-card-<id>` får ny tilfeldig id ved hver rendering, så like id-er betyr at svaret kom fra cachen, og det skal den.
- **Proxyen** svarer 302 til `/umbraco` på rot-URL-en, og mediefiler har `Cache-Control` (#686). tt02-frontend henter bilder direkte fra dis-core og ikke via proxyen, så på tt02 må media sjekkes mot proxy-verten.

### 5.4 NuGet og base-image

```sh
pnpm run cms:build                                         # 0 feil, antall advarsler som før
dotnet list apps/cms-umbraco package --outdated
dotnet list apps/cms-umbraco package --vulnerable --include-transitive
```

- **Base-image:** `node scripts/dotnet-image-versjon.mjs` viser .NET-versjonen i de låste digestene og i dagens tag. Den avslutter med kode 1 når de er ulike. Kjør den før og etter.
- **Swagger:** en endring i OpenApi, Swashbuckle eller ASP.NET krever at swagger-dokumentene svarer 200 ved kjøring. Noter stien her første gang sjekken kjøres.

### 5.5 Umbraco og uSync, prod-lik test

Gjelder alle oppgraderinger av `Umbraco.Cms`, `Umbraco.Cms.DevelopmentMode.Backoffice`, `Umbraco.StorageProviders.AzureBlob` og `uSync`, også patch.

1. **Arbeidstre A på main og B på branchen.** Ingen av dem skal ha `apps/cms-umbraco/umbraco/Data/Umbraco.sqlite.db` fra før.
2. **Start A prod-likt:**
   ```sh
   node scripts/sync-content-routes.js
   cd apps/cms-umbraco && USYNC_OWNS_SCHEMA=true uSync__Settings__ImportAtStartup=Settings dotnet run
   ```
   Vent til `curl -s http://localhost:5000/umbraco/management/api/v1/server/status` gir `"serverStatus":"Run"`. Stopp så, og sjekk at port 5000 er fri.
3. **Dump nøklene i A:**
   ```sql
   SELECT 'ct', n.uniqueId, ct.alias FROM cmsContentType ct JOIN umbracoNode n ON n.id = ct.nodeId
   UNION ALL SELECT 'dt', n.uniqueId, n.text || ' ' || dt.propertyEditorAlias FROM umbracoDataType dt JOIN umbracoNode n ON n.id = dt.nodeId
   UNION ALL SELECT 'pt', pt.UniqueId, ct.alias || '.' || pt.Alias FROM cmsPropertyType pt JOIN cmsContentType ct ON ct.nodeId = pt.contentTypeId
   ORDER BY 1, 3;
   ```
   Kjør med `sqlite3 -readonly apps/cms-umbraco/umbraco/Data/Umbraco.sqlite.db "<spørring>" > a.txt`.
4. **Legg inn testinnhold i A** med noen blokker, tagger og felt fra hver innholdstype, og publiser. Den lokale kastebrukeren fra CLAUDE.md er grei her, bare mot localhost. Stopp A.
5. **Kopier databasen fra A til B,** samme sti, med A stoppet. Kopier `apps/cms-umbraco/wwwroot/media` også, hvis testinnholdet har bilder. Start B med samme miljøvariabler.
6. **Sjekk loggen i B** (`apps/cms-umbraco/umbraco/Logs/UmbracoTraceLog.*.json`):
   - linja «uSync Import: … changes» har bare de endringene som var ventet
   - ingen `SchemaRekeyGuard`, og ingen feil fra migreringer
   - `serverStatus` er `Run`
7. **Dump nøklene i B** til `b.txt`. `diff a.txt b.txt` skal være tom, eller bare vise det PR-en endrer med vilje.
8. **Innholdet fra punkt 4:** Delivery API på `http://localhost:5000` gir de samme verdiene, og ingen blokk har `Unsupported`.
9. **Rydd opp:**
   ```sh
   git checkout -- apps/cms-umbraco/appsettings.json apps/cms-umbraco/appsettings-schema.Umbraco.Cms.json
   ```
   Lokal kjøring skriver om begge. Stopp prosessene, og sjekk port 5000 med `lsof`.

Major-versjoner av Umbraco følger i tillegg Umbracos egen oppgraderingsguide for versjonen.

### 5.6 CMS-deploy og måling

```sh
gh run list --repo digdir/ki.norge.no --workflow publish-syncroot-main.yaml --limit 3   # siste tag, velg neste nummer
gh workflow run docker-publish.yaml --repo digdir/ki.norge.no --ref main -f tag=<N>-<kort-navn>
gh workflow run publish-syncroot-main.yaml --repo digdir/ki.norge.no --ref main \
  -f environment=tt02 -f image-tag=<N>-<kort-navn> -f database=AzureSQL
```

- **Podden har rullet** når `Last-Modified` på `https://<cms-vert>/App_Plugins/Malform/umbraco-package.json?cb=$RANDOM` endrer seg til byggetidspunktet. Bruk alltid en cache-buster.
- **Etter rullering:**
  - `node scripts/cms-telling.mjs <cms-vert>` gir samme tall som baseline
  - `node scripts/cms-telling.mjs <cms-vert> --noder` gir samme nodeliste, med `diff` mot en fil lagret før deploy
  - `/umbraco` svarer 200
  - `/health` på frontend er Healthy
- **Så prod** med samme tag. Redaktører kan havne i innloggingssløyfe etter omstart. Privat vindu eller tømt localStorage løser det.

### 5.7 Renovate-regler

Endringer i `renovate.json` valideres før PR:

```sh
npx --yes --package renovate@latest renovate-config-validator --no-global --strict renovate.json
```

Hver regel har en `description` som sier hvorfor den finnes, og når den kan fjernes.

### 5.8 Fjerne en override

1. Noter løst versjon: `pnpm why <pakke> -r`.
2. Fjern linja i `pnpm-workspace.yaml`, og kjør `pnpm install`.
3. `pnpm why <pakke> -r` på nytt. Løst versjon skal være minst like høy.
4. `pnpm-lock.yaml` skal bare miste override-linja.
5. Trivy skal gi 0 funn.

Ellers blir overriden stående, med en kommentar om hvorfor.

## 6. Runde 1 (fra 2026-09-28)

### Funn

| Funn | Konsekvens | Tiltak |
| --- | --- | --- |
| Base-imagene står på .NET 10.0.10 (14. juli). Dagens 10.0-image er 10.0.12 (21. september) | CMS-runtime i prod mangler to månedlige sikkerhetsoppdateringer | Fase 1 |
| Digest-PR-ene for base-imagene står i «Pending Status Checks» i dashbordet, og ingen er laget siden juli | Bekreftet med Renovate lokalt: «digest update of mcr.microsoft.com/dotnet/sdk has no releaseTimestamp to age against». De blir aldri modne | Fase 0 og 1 |
| Torsdag 1.10 åpnes PR-er for Umbraco 18, uSync 18, vitest 5, pnpm 12 og @astrojs/react 7 | Rutinen flagger dem, men beslutningen må tas | Fase 0 |
| `cache-kinorgeportal-tt02` er deployet 11.6 og mangler #542. `cms-kinorgeportal-tt02` er deployet 15.7 og mangler #686 | Lite merkbart. `/health` (no-store) ble ikke cachet på tt02 heller, målt på innholdet 28.9 | Fase 1 |
| `pnpm audit`: 2 HIGH (brace-expansion) og 2 moderate (qs), alle via `@digdir/designsystemet` (tokens-CLI, bare utvikling) | Ikke i nettstedet. Trivy ser dem ikke | Fase 1 |
| #742 (OpenApi 3) er «abandoned» og står åpen. #795 (TypeScript 7, bare cache-workeren) er flagget hver dag | Støy i rutinen | Fase 0 og 3 |
| GitHub flytter `ubuntu-latest` til Ubuntu 26 fra 19. oktober | CI bytter OS uten en endring hos oss | Fase 4, før 19.10 |
| `aquasecurity/trivy-action` er låst til en commit på `master`, ikke en release | Siste release (v0.36.0, april) er eldre enn commiten vi står på (august, Trivy 0.74). Å bytte til releasen er en nedgradering, og SHA-pinnen er uforanderlig uansett | Blir stående |
| CI kjører enhetstestene to ganger («Unit tests» og «Enhetstester»). Testene for cache-workeren kjører ikke i CI | Tregere CI, og ingen dekning av workeren | Fase 4 |
| `minimumReleaseAgeExclude` har ni gamle oppføringer (astro 6.4.7, designsystemet 1.15.0 og andre) | Unntak fra en sikkerhetsvakt ingen trenger lenger | Fase 4 |
| Umbraco-minor går i gruppen «nuget non-major». Rutinen flagger minor av Umbraco.Cms fra juli, men ikke patch, uSync eller AzureBlob | uSync har re-nøklet i en patch før (17.3.6) | Fase 0 |
| NuGet: ingen kjente sårbarheter. Umbraco, uSync og AzureBlob står på siste 17.x | Bra | Ingen |

### Fase 0: regler og beslutninger, før torsdag 1.10

- [x] **PR med Renovate-regler** (5.7), #809:
  - Umbraco-familien og uSync holdes under 18 (`allowedVersions: "<18.0.0"`). Umbraco 17 er LTS, og 18 tas som egen, planlagt oppgradering.
  - `dotnet/aspnet` og `dotnet/sdk` holdes på 10 (`allowedVersions: "<11"`). .NET 10 er LTS, og Umbraco 17 bygger på den.
  - Digest-oppdateringer av base-image lages uten ventetid (`matchUpdateTypes: ["digest"]`, `minimumReleaseAge: "0 days"`).
  - `vitest` i cache-workeren holdes under 5 til `@cloudflare/vitest-pool-workers` støtter den (0.22.0 krever `^4.1.0`).
  - Umbraco og uSync får egen gruppe, så minor ikke havner i «nuget non-major».
- [x] **Rutinen** merger aldri PR-er som endrer Umbraco eller uSync (`prompt.md` på Lars' Mac, krever Lars).
- [x] **Lukk #742** (krever Lars).
- [ ] **Etter torsdagens kjøring:** kom digest-PR-ene for base-imagene? Hvis ikke, se Renovate-loggen for repoet på developer.mend.io.

### Fase 1: sikkerhet og drift

- [x] **Base-image til 10.0.12** (#810, image `70-dotnet-10-0-12` i tt02 og prod 28.9). PR som oppdaterer begge digestene hvis Renovate ikke har laget den. Deretter `pnpm run cms:build`, CI, nytt image, tt02, måling (5.6), og prod.
- [x] **tt02-workerne synkes med main** (5.3). Prod er allerede oppdatert.
- [ ] **Sårbarhetene i tokens-CLI-en.** Først `@digdir/designsystemet` 1.23.0 i roten. Fikser ikke det, overrides for `brace-expansion` (`^5.0.9`) og `qs` (`^6.16.0`). Verifiser med `pnpm audit --audit-level high`, og at `pnpm run tokens:build` gir samme `design-tokens-build/` som før (`git diff --stat`).

### Fase 2: minor og patch fra torsdag

- [ ] **npm non-major:** astro 7.3.5, `@astrojs/cloudflare` 14.3.3, wrangler, designsystemet 1.23.0 og aksel-ikoner 8.17.2. Følg 5.2 med skjermbilder, siden designsystemet og ikonene kan endre utseende. Sjekk sharp- og wrangler-kravene fra 3.
- [ ] **nuget non-major:** OpenTelemetry 1.19.1 og MailKit 4.18.1. `cms:build`, CI, og ut med neste CMS-image.

### Fase 3: major, én om gangen

- [ ] **TypeScript 7 (#795),** bare i cache-workeren. Vitest (5.3), `wrangler types` og deploy med `--dry-run`. Frontend har ikke TypeScript som egen avhengighet.
- [ ] **@astrojs/react 7.** Krever ny peer, `oxc-transform-react ^0.145.0`, som må legges til. Følg 5.2 med øyene.
- [ ] **pnpm 12.** `packageManager` i `package.json`. Les endringsnotatene for lockfil-format og innstillingene i `pnpm-workspace.yaml` (`overrides`, `minimumReleaseAge`, `allowBuilds`). `pnpm install --frozen-lockfile` skal virke i CI.
- [ ] **vitest 5 i frontend.** Cache-workeren venter, se fase 0.
- [ ] **@types/node:** installert er 25, runtime er Node 24. Bestem om typene skal følge runtime (`^24`), før 26 tas inn.
- [ ] **Umbraco 18** tas ikke i denne runden. Bestemmes sammen med Lars når det er grunn til det, og følger 5.5 fullt ut.

### Fase 4: rydding og vakter

- [ ] **CI på `ubuntu-26.04` før 19. oktober.** Kjør en gang på `ubuntu-26.04`, eller lås `ubuntu-24.04` til det er testet.
- [x] **Fjern det doble testløpet** i frontend-jobben, og legg cache-workerens tester inn i CI.
- [x] **`trivy-action`:** blir stående, se funnene.
- [x] **Én bot for Actions.** Både Renovate (via `config:recommended`) og Dependabot (`.github/dependabot.yml`) oppdaterer Actions. Behold Renovate, som grupperer og låser med digest, og fjern versjonsoppdateringene i `dependabot.yml`. Sikkerhetsvarslene fra Dependabot beholdes.
- [x] **Rydd `minimumReleaseAgeExclude`.** Ingen av oppføringene gjelder versjoner vi bruker.
- [ ] **Hver override vurderes etter 5.8,** og overflødige fjernes.
- [ ] **`compatibility_date`** i de tre workerne flyttes bevisst, med test på tt02.

## 7. Dette krever Lars

- CMS-deploy til prod når auto-modus stopper kommandoen. Det har skjedd.
- Å lukke PR-er, kommentere eller poste noe på GitHub.
- Endringer i rutinen på Lars' Mac.
- Major av Umbraco eller .NET, og alt som endrer CMS-skjemaet.
