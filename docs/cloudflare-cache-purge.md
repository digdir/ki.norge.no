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
