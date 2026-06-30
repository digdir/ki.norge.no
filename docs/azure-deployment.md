# Deployment Guide — KI Norge

## Architecture

```
Redaktører → Azure Web App (Umbraco + SQLite)
                  ↓ webhook ved publisering (fremtidig)
             Cloudflare Pages rebuild
                  ↓
             Sluttbrukere ser statisk side
```

Option A: SQLite (enklest, billigst). Kan byttes til Azure SQL Database senere (endre connection string).

## Forutsetninger

- Contributor-tilgang til Azure-abonnementet
- Azure CLI installert (`brew install azure-cli`)
- Logget inn (`az login`)

## Steg 1: Opprett ressursgruppe

```bash
az group create --name rg-kinorge --location norwayeast
```

## Steg 2: Opprett App Service Plan

Bruk en eksisterende plan hvis Pooria/Alv allerede har en. Ellers:

```bash
az appservice plan create \
  --name plan-portaler \
  --resource-group rg-kinorge \
  --sku B1 \
  --is-linux
```

## Steg 3: Opprett Web App

```bash
az webapp create \
  --name kinorge-cms \
  --resource-group rg-kinorge \
  --plan plan-portaler \
  --runtime "DOTNETCORE:10.0"
```

## Steg 4: Konfigurer App Settings

Generer nye nøkler for produksjon (IKKE gjenbruk dev-nøkler):

```bash
# Generer tilfeldige nøkler
API_KEY=$(openssl rand -base64 32)
PREVIEW_SECRET=$(openssl rand -hex 16)

az webapp config appsettings set \
  --name kinorge-cms \
  --resource-group rg-kinorge \
  --settings \
    ASPNETCORE_ENVIRONMENT=Production \
    Umbraco__CMS__DeliveryApi__ApiKey=$API_KEY \
    HeadlessPreview__FrontendUrl=https://ki.norge.no \
    HeadlessPreview__PreviewSecret=$PREVIEW_SECRET
```

Merk: Azure Web Apps leser environment variables med `__` som separator for nested JSON-verdier.

## Steg 5: Deploy

### Alternativ A: Deploy fra kildekode (enklest)

```bash
cd apps/cms-umbraco
az webapp up \
  --name kinorge-cms \
  --resource-group rg-kinorge \
  --runtime "DOTNETCORE:10.0"
```

### Alternativ B: Deploy med Docker

```bash
cd apps/cms-umbraco

# Bygg image
docker build -t kinorge-cms .

# Tag og push til Azure Container Registry (hvis dere har en)
# docker tag kinorge-cms <acr-name>.azurecr.io/kinorge-cms:latest
# docker push <acr-name>.azurecr.io/kinorge-cms:latest

# Eller deploy direkte
az webapp config container set \
  --name kinorge-cms \
  --resource-group rg-kinorge \
  --container-image-name kinorge-cms:latest
```

## Steg 6: Første oppstart

1. Gå til `https://kinorge-cms.azurewebsites.net/umbraco`
2. Umbraco ber deg opprette admin-bruker
3. ContentTypeComposer oppretter alle innholdstyper automatisk
4. ContentSeeder fyller inn demo-innhold

## Steg 7: Koble frontend

Oppdater frontend sin `.env` (eller Cloudflare Pages environment variables):

```
UMBRACO_URL=https://kinorge-cms.azurewebsites.net
UMBRACO_API_KEY=<samme API_KEY som i steg 4>
PREVIEW_SECRET=<samme PREVIEW_SECRET som i steg 4>
```

## Bytte til Azure SQL Database senere (Option B)

Hvis SQLite ikke holder:

```bash
# Opprett SQL Server + database
az sql server create --name kinorge-sql --resource-group rg-kinorge --admin-user kinorge --admin-password <passord>
az sql db create --name umbraco --server kinorge-sql --resource-group rg-kinorge --service-objective Basic

# Sett connection string
az webapp config connection-string set \
  --name kinorge-cms \
  --resource-group rg-kinorge \
  --connection-string-type SQLAzure \
  --settings umbracoDbDSN="Server=kinorge-sql.database.windows.net;Database=umbraco;User Id=kinorge;Password=<passord>;Encrypt=True;"
```

Fjern `umbracoDbDSN_ProviderName` fra appsettings.json (Umbraco oppdager SQL Server automatisk).

## Viktige Azure-innstillinger

Disse er allerede satt i `appsettings.Production.json`:

| Setting | Verdi | Hvorfor |
|---|---|---|
| `MainDomLock` | `FileSystemMainDomLock` | Azure Web Apps krever dette |
| `LocalTempStorageLocation` | `EnvironmentTemp` | Bedre ytelse på Azure |
| `LuceneDirectoryFactory` | `SyncedTempFileSystemDirectoryFactory` | Søkeindeks fungerer på Azure |

---

## Cloudflare Pages — Frontend

Frontenden (Astro) deployes til Cloudflare Pages. Statiske sider serveres fra CDN, SSR-sider (`/api/search`, `/api/preview`) kjører som Cloudflare Workers.

### Alternativ A: Koble til GitHub (anbefalt)

1. Logg inn på [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project
2. Koble til GitHub-repoet `ki.norge.no`
3. Konfigurer bygget:
   - **Build command:** `cd apps/frontend && pnpm install && pnpm run build`
   - **Build output directory:** `apps/frontend/dist`
   - **Root directory:** `/`
4. Legg til environment variables:

   | Variable | Verdi |
   |---|---|
   | `UMBRACO_URL` | `https://kinorge-cms.azurewebsites.net` |
   | `UMBRACO_API_KEY` | Samme API-nøkkel som i Azure steg 4 |
   | `SITE_URL` | `https://ki.norge.no` |
   | `PREVIEW_SECRET` | Samme preview-secret som i Azure steg 4 |

5. Deploy — Cloudflare bygger og deployer automatisk ved push til main

### Alternativ B: Manuell deploy med Wrangler

```bash
cd apps/frontend
pnpm install
pnpm run build
npx wrangler pages deploy dist --project-name ki-norge
```

### Custom domain

Etter første deploy, legg til custom domain i Cloudflare Pages → Custom domains → `ki.norge.no`. Cloudflare håndterer SSL automatisk.

### Gratisplan

Cloudflare Pages Free inkluderer:
- 500 bygg per måned
- Ubegrenset båndbredde for statiske sider
- 100 000 Worker-requests per dag (for `/api/search` og `/api/preview`)
- DDoS-beskyttelse og CDN

---

## Kostnadsestimat

| Ressurs | Tier | Ca. kostnad/mnd |
|---|---|---|
| App Service Plan (B1) | Delt med andre apper | ~100 kr (delt) |
| SQLite | Inkludert | 0 kr |
| Azure SQL Database (hvis Option B) | Basic | ~50 kr |
| Cloudflare Pages | Free | 0 kr |
