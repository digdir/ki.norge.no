# Cloudflare edge-cache purge ved publisering

Purger Cloudflare-edgen for ki.norge.no automatisk når en redaktør publiserer,
avpubliserer eller sletter innhold, slik at endringer vises med en gang i stedet for
å vente på at edge-TTL-en (`s-maxage`, 10 min) går ut.

## Hvordan det virker

- Notifikasjons-handlere (`CachePurge/EventHandlers/`) fanger
  `ContentPublished` / `ContentUnpublished` / `ContentMovedToRecycleBin`.
- `FrontendUrlResolver` mapper innholdsnoden til de offentlige frontend-URLene den
  påvirker (egen URL fra `slug` + listeside + forsiden der innholdet løftes). Frontend
  ruter på `slug`-feltet, ikke Umbracos tre-URL, derfor en eksplisitt type→rute-tabell.
- `CachePurgeDispatcher` samler URLene og purger dem **fire-and-forget** (blokkerer ikke
  "Lagrer…"-spinneren). Mistes et purge (pod-restart), dekker `s-maxage` det innen 10 min.
- `CloudflareCachePurgeService` purger **per URL** (`files`), som virker på Business-planen.
  Globale endringer (`globaleInnstillinger` = header/footer) og masse-publisering over
  `AffectedUrlThreshold` eskalerer til `purge_everything`.

No-op til `ZoneId` **og** `ApiToken` er satt — trygt å deploye før secreten finnes.

## Oppsett (gjenstår: API-token)

Config-seksjon `Cloudflare` (se `appsettings.json`). Per miljø:

| Verdi | Hvor | Status |
|-------|------|--------|
| `Cloudflare__SiteBaseUrl` | env-var i `syncroot/{prod,tt02}/kustomization.yaml` | satt (prod `https://ki.norge.no`, tt02 `https://ki.test.norge.no`) |
| `Cloudflare--ZoneId` | Azure Key Vault (per miljø) | **gjenstår** (ikke hemmelig, men legges i vault for enkelhet) |
| `Cloudflare--ApiToken` | Azure Key Vault (per miljø) | **gjenstår** (krever superadmin på Cloudflare) |

### Lage API-token (Cloudflare)

1. Cloudflare dashboard → øverst til høyre (profil) → **My Profile → API Tokens → Create Token**.
2. Velg **Create Custom Token**.
3. **Permissions:** `Zone` → `Cache Purge` → `Purge` (kun denne, minste privilegium).
4. **Zone Resources:** `Include` → `Specific zone` → `norge.no`.
5. Create → kopier token (vises kun én gang).

### Hente Zone ID

`norge.no`-sonen → **Overview** → høyre sidemeny → **Zone ID** (ikke hemmelig).

### Legge inn

For hvert miljø (prod + tt02), legg secretene i miljøets Key Vault:

- `Cloudflare--ApiToken` = token fra steget over
- `Cloudflare--ZoneId` = norge.no Zone ID (samme verdi for prod og tt02)

Redeploy CMS. Verifiser i oppstartsloggen:
`Cloudflare cache-purge: Enabled=True, ZoneId=<satt>, ApiToken=<satt>, SiteBaseUrl=https://ki.norge.no`.

## Purge ved deploy, og hvorfor den bruker purge_everything

`apps/frontend/scripts/purge-cache.mjs` er en annen sak enn purgen over. Den kjører
i `deploy:prod` / `deploy:tt02` og finnes fordi en deploy roterer de innholdshashede
`_astro`-filnavnene. Edge-cachen sitter samtidig på HTML fra før deployen, og den
HTML-en peker på filer som ikke finnes lenger, som gir en ustylet side (#428).

Den bruker `purge_everything`. Det ser grovt ut, og det er et **målt valg**, ikke
latskap. To forsøk på å gjøre det finere er vurdert og forkastet. Les dette før du
"forbedrer" det.

### Sprengradiusen er bare våre egne miljø

Innvendingen mot `purge_everything` er at `norge.no`-sonen deles. Den er målt.

Sertifikat-transparenslogg for `%.norge.no` gir 24 unike hostnavn. Oppslag på alle 24
viser at nøyaktig fire er CNAME-et til `cdn.cloudflare.net`, altså proxet i partial-sonen:

    ki.norge.no  ki.test.norge.no  cms.ki.norge.no  cms.ki.test.norge.no

Resten peker på `lb.digdir.no`, Google, eller er NXDOMAIN. `purge_everything` treffer
derfor bare oss. Kostnaden er en kald tt02-cache i noen minutter når prod deployes.

Metoden er etterprøvbar:

```sh
curl -s "https://crt.sh/?q=%25.norge.no&output=json" \
  | jq -r '.[].name_value' \
  | sed 's/^\*\.//' \
  | tr 'A-Z' 'a-z' \
  | grep -E '(^|\.)norge\.no$' \
  | sort -u
# deretter, for hver: dig +short <host> CNAME | grep cdn.cloudflare.net
```

`sed` fjerner wildcard-SAN-er (`*.data.norge.no`), som ellers havner i lista som
hostnavn ingen kan slå opp. `tr` trengs fordi CT returnerer blandet case, så `sort -u`
ellers gir både `norge.no` og `NORGE.NO`. `grep` filtrerer bort `datanorge.no`, et
annet domene som crt.sh sitt LIKE-mønster fanger opp.

crt.sh er ustabil og svarer jevnlig 404 eller 502. Tomt resultat betyr som regel at
tjenesten er nede, ikke at målingen er feil. Prøv igjen senere.

CT og oppslag er den beste sjekken vi kan gjøre uten sone-tilgang, og den er sterk
fordi et Cloudflare-proxet hostnavn får Universal SSL og dermed havner i CT. Den er
ikke autoritativ: den bommer på et proxet hostnavn uten offentlig sertifikat, og den
er et øyeblikksbilde. Autoritativ liste er DNS-fanen for `norge.no`-sonen i
Cloudflare-dashbordet.

Sjekk den på nytt hvis noen legger et nytt hostnavn i sonen. `minid.norge.no` og
`minside.norge.no` finnes i CT-loggen. De er NXDOMAIN i dag, men sonen deles med
tjenester der en purge per frontend-deploy ikke ville vært en skuldertrekning.

### Hvorfor ikke purge per URL

`files`-arrayet virker på Business, og CMS-purgen over bruker det allerede. Det er
likevel feil her, fordi **cache-nøkkelen er hele URLen med query**.

En besøkende som kommer inn på `/artikler/foo?utm_source=nyhetsbrev` lager sin egen
cache-entry. Et `files`-purge av den kanoniske URLen treffer den ikke. `purge_everything`
treffer den. Å bytte ville altså gitt et delvis purge i stedet for et uttømmende, og
latt nøyaktig den bugen vi fikser leve videre på taggede lenker fra nyhetsbrev og
sosiale medier.

Dekningen er ikke problemet: `/sitemap.xml` har 74 URLer og dekker rutene. Hullet er
utm-varianter.

**Rekkefølgen er derfor:** normaliser cache-nøkkelen i `apps/cache-kinorgeportal` først
(strip `utm_*`, `fbclid`, `gclid` og liknende fra nøkkelen, ikke fra origin-fetchen),
og først da blir purge per URL uttømmende. Ingen side varierer innhold på sporingsparametre.
De eneste query-parametrene koden leser er `preview` (setter `no-store`), `key` på
`/admin-tilgang` (`no-store`) og `redirect` i `/api/exit-preview` (API-rute,
`no-store`). Ingen av dem berøres av en allowlist som kun stripper `utm_*`, `fbclid`
og `gclid`, så normaliseringen er semantisk trygg. Den ville dessuten gitt bedre hit rate på taggede lenker, som i dag
får kald cache per unike variant.

### Parkert, ikke løst

- **Nøkkel-normalisering** som over. Effektivitetsforbedring, ikke feilretting, siden
  `purge_everything` allerede dekker utm-hullet. Tas neste gang cache-workeren
  uansett skal deployes.
- **`headers: request.headers` i cacheKey** er støy. `caches.default` nøkler på URL, og
  `Vary` på det lagrede svaret styrer header-varians. Samme disposisjon.
- **Credential-svakheten.** Scriptet hardfeiler uten `CLOUDFLARE_PURGE_TOKEN`, som bare
  finnes lokalt. Ingen kan deploye i den tro at cachen ble tømt, så feilmodusen er
  høylytt. Begynner det å svi, for eksempel når CI deployer, er svaret å la
  cache-workeren slå opp frontendens faktiske versjon (via `CF_VERSION_METADATA` på
  frontenden, eksponert på et endepunkt) og folde den inn i cache-nøkkelen.

### Forkastet

Å binde `CF_VERSION_METADATA` på **cache-workeren** og deploye den sammen med frontenden.
Den gir cache-workerens egen version-id, altså en stedfortreder for frontendens versjon,
og virker bare så lenge deploy-scriptet tvinger de to til å følges. Enhver sti som
deployer frontenden alene, som en hotfix, CI eller `wrangler rollback`, serverer da
gammel HTML uten noe signal om hvorfor.
