# Composers in the CMS

Umbraco finds and loads all classes that implement `IComposer` at startup, no matter which folder they are in. There is no list to register them in. But not all of them do anything in production. Some register only when the configuration exists, and one reacts to a content type that does not exist.

In production here means prod and tt02. The configuration comes from three places:

- `apps/cms-umbraco/appsettings.json`, with empty default values
- env variables in `syncroot/`, shared in `base/` and per environment in `prod/` and `tt02/`
- the environment's Key Vault, where the key is written with `--` instead of `:`, for example `Cloudflare--ApiToken` for `Cloudflare:ApiToken`

Key Vault is read only at startup, so a new or changed value requires a new pod. If loading fails, `Program.cs` logs the error and starts without the values. The composers that need them then become silently inactive.

## Overview

| Composer | Folder | Prod | tt02 | Turned on by |
|---|---|---|---|---|
| `ContentTypeComposer` | `Composers/` | No | No | Missing `USYNC_OWNS_SCHEMA=true`. Runs locally and in CI |
| `SchemaRekeyGuardComposer` | `Composers/` | Yes | Yes | Always. Acts on every uSync import |
| `SchemaOriginStampComposer` | `Composers/` | Yes | Yes | Always. Acts only on a manual export |
| `ContentSlugComposer` | `Composers/` | Yes | Yes | Always |
| `MerkelappSlugComposer` | `Composers/` | No | No | The content type `merkelapp`, which does not exist |
| `VeiledningStegGuideSlugComposer` | `Composers/` | Yes | Yes | Always |
| `UrlFieldWashComposer` | `Composers/` | Yes | Yes | The data type "Lenke / URL" |
| `NbspWashComposer` | `Composers/` | Yes | Yes | Always |
| `SandkasseSingleInstanceComposer` | `Composers/` | Yes | Yes | Always |
| `AdminProtectionComposer` | `Composers/` | Yes | Yes | Always |
| `NorwegianIdentityErrorDescriberComposer` | `Composers/` | Yes | Yes | Always. Applies to local passwords |
| `HeadlessPreviewComposer` | `Composers/` | Yes | Yes | `HeadlessPreview:FrontendUrl` and `HeadlessPreview:PreviewSecret` |
| `AzureBlobMediaComposer` | `Composers/` | Yes | Yes | `Umbraco:Storage:AzureBlob:Media:ConnectionString` |
| `MicrosoftEntraIdBackOfficeExternalLoginComposer` | `CustomAuthentication/` | Yes | Yes | Four `MicrosoftEntraId` values, or `MicrosoftEntraId:Enabled` |
| `CachePurgeComposer` | `CachePurge/` | Yes | See below | `Cloudflare:ApiToken`, `Cloudflare:ZoneId` and `Cloudflare:SiteBaseUrl` |
| `SearchComposer` | `Search/` | Yes | No, on purpose | `Elasticsearch:Endpoint` |
| `MalformComposer` | `Malform/` | Yes | Yes | Always |
| `OpenTelemetryComposer` | `Telemetry/` | Yes | Yes | `OTEL_EXPORTER_OTLP_ENDPOINT` |

`InternalUrlWasher.cs` is in `Composers/`, but is a helper class for `UrlFieldWashHandler` and not a composer.

Three of the composers depend on each other. `MalformComposer` uses the text extractor that `SearchComposer` registers, and the text extractor uses `ContentRouteResolver`, which only `HeadlessPreviewComposer` registers. If `SearchComposer` is removed, the Malform report stops working. If `HeadlessPreviewComposer` is removed, indexing stops working too.

## Schema and uSync

### ContentTypeComposer

`Composers/ContentTypeComposer.cs`

**Does.** Creates and migrates document types, element types and data types at startup. Each step runs on its own, so an error in one step is logged and the rest continue.

**In production.** No. The composer stops when `USYNC_OWNS_SCHEMA=true`, and that is set in both `syncroot/prod` and `syncroot/tt02`. The schema in production comes from the `.config` files under `apps/cms-umbraco/uSync/v17/`, which uSync imports at startup (`uSync__Settings__ImportAtStartup`). The composer runs only locally and in CI.

**Traps.**

- CI starts the CMS with `dotnet run`, without `USYNC_OWNS_SCHEMA` and with `ImportAtStartup: None` from `appsettings.json`. No uSync import happens. The end-to-end tests therefore run against the composer's schema, not against prod's.
- A field added here is green locally and in CI, but never reaches prod. New fields go in the uSync files, see "Schema and uSync" in [system-documentation.md](system-documentation.md#schema-and-usync).
- The cleanup of retired types deletes the types and all their nodes permanently, on every startup where the composer runs. Never start the CMS without `USYNC_OWNS_SCHEMA=true` against a copy of a real database.

### SchemaRekeyGuardComposer

`Composers/SchemaRekeyGuard.cs`

**Does.** Registers two handlers around the uSync import.

- `SchemaRekeyGuard` compares the key in each `.config` file under `ContentTypes/` and `DataTypes/` with the key in the database before the import starts. If the import would give an existing type a new key, it is stopped. Block content references types by key, so such an import makes all block content "Unsupported".
- `SchemaImportReporter` logs at Error level and to stderr when an import changed something. Zero changes is the normal state and is not logged.

**In production.** Yes, on the import at every startup and on import from the backoffice.

**Traps.**

- uSync 17.3.6 does not respect `Cancel`, so the guard throws an exception to stop the import.
- `USYNC_ALLOW_REKEY=true` lets a re-key through with a warning. Use it only when the re-key is intended.
- After an intended schema change, the first startup logs the change at Error level. That is expected.

### SchemaOriginStampComposer

`Composers/SchemaOriginStamp.cs`

**Does.** Writes `uSync/v17/.origin` after a uSync export, with the environment, `UmbracoApplicationUrl` and the time. The environment is derived from `UmbracoApplicationUrl`. `scripts/check-usync-schema.sh` in CI rejects a PR where `.origin` does not say `prod`.

**In production.** Registered in both environments, but acts only when someone exports manually from uSync in the backoffice. `ExportOnSave` and `ExportAtStartup` are set to `None`.

**Traps.**

- The stamp is written on all exports as long as `ContentTypes/` exists, and in production it is always in the image. A pure content export also gets the stamp.

## When content is saved

### ContentSlugComposer

`Composers/ContentSlugHandler.cs`

**Does.** Cleans `slug` into a URL-friendly value on save, for all content types that have the field. If the field is empty, the slug is created from `tittel`, otherwise from the node name. Æ, ø and å become e, o and a.

**In production.** Yes.

**Traps.**

- The transliteration differs from Umbraco's default (ae, oe, aa). Other places that use Umbraco's helper directly give different slugs for the same text.
- `merkelapp` is skipped, because `MerkelappSlugComposer` was meant to own it.

### MerkelappSlugComposer

`Composers/MerkelappSlugHandler.cs`

**Does.** Sets `slug` from `navn` when a node of type `merkelapp` is saved.

**In production.** No. The content type `merkelapp` does not exist in the uSync schema. Locally `ContentTypeComposer` deletes it in the cleanup. The tags on the examples are Tags fields from [#792](https://github.com/digdir/ki.norge.no/pull/792). The handler has nothing to react to anywhere.

### VeiledningStegGuideSlugComposer

`Composers/VeiledningStegGuideSlugHandler.cs`

**Does.** Sets `guideSlug` on a `veiledningSteg` to the slug of the `veiledningGuide` node it sits under. The field is overwritten on every save.

**In production.** Yes. The frontend builds the step navigation from `guideSlug`, and the cache purge uses it to find the step's URL.

**Traps.**

- The handler runs when the step is saved, not when the guide is saved. If the slug of a guide changes, the steps keep the old one until they are saved again.

### UrlFieldWashComposer

`Composers/UrlFieldWashHandler.cs` and `Composers/InternalUrlWasher.cs`

**Does.** Cleans all fields with the data type "Lenke / URL" on save, also inside Block List and Block Grid and in blocks within blocks. Only internal paths are cleaned. They get one leading slash, no trailing slash, no double slashes and no spaces. External URLs, anchors and domains without a scheme are only trimmed.

**In production.** Yes. 11 content types in the uSync schema use the data type.

**Traps.**

- The data type is found by the name "Lenke / URL". If it gets a different name, the cleaning stops without an error message.
- A link field is only cleaned if it uses this data type, not a plain text string.

### NbspWashComposer

`Composers/NbspWashHandler.cs`

**Does.** Replaces non-breaking spaces (U+00A0, `&nbsp;`, `&#160;` and `&#xA0;`) with normal spaces on save. Applies to text, textarea and RichText fields and to whole Block List and Block Grid values.

**In production.** Yes.

**Traps.**

- Only what is saved after the handler was added gets cleaned. Older nodes are cleaned when they are saved again. The frontend normalises non-breaking spaces on display anyway.
- Non-breaking spaces set on purpose, as in "10 000", also become normal spaces.

### SandkasseSingleInstanceComposer

`Composers/SandkasseSingleInstanceHandler.cs`

**Does.** Stops saving a new `sandkasse` node when one already exists, with an error message to the editor. The frontend has only one `/sandkasse`.

**In production.** Yes.

**Traps.**

- A sandkasse in the recycle bin does not count. Unpublished ones do.

## Backoffice and users

### MicrosoftEntraIdBackOfficeExternalLoginComposer

`CustomAuthentication/`

**Does.** Provides the "Microsoft" button on the backoffice login. A new user is linked and approved automatically on first login. On every login the Umbraco groups are set from the app roles in Entra ID, where `umbraco-admin` gives `admin` and `umbraco-redaktor` gives `editor`. Without one of the roles the login is denied. New users are added with `pnpm run cms:add-user`.

**In production.** Yes in both environments. Turned on when `MicrosoftEntraId:ClientId`, `ClientSecret`, `Authority` and `CallbackPath` exist, in Key Vault as `MicrosoftEntraId--ClientId` etc. `MicrosoftEntraId:Enabled` overrides. `false` turns the login off, and `true` requires all four values.

**Traps.**

- `Enabled=true` with a missing value stops the startup.
- Groups set by hand in the backoffice are overwritten on the next login. Access is managed in Entra ID.
- Local password login is still enabled alongside (`DenyLocalLogin = false`).
- A user who is disabled in Umbraco is not enabled again on login.

### AdminProtectionComposer

`Composers/AdminProtectionHandler.cs`

**Does.** Stops deletion of the user `admin@ki.norge.no`, so nobody can lock everyone out by deleting the only administrator.

**In production.** Yes.

**Traps.**

- If the account is to be replaced, `ProtectedAdminEmail` is changed in the code and rolled out before the change is made in the backoffice.

### NorwegianIdentityErrorDescriberComposer

`Composers/NorwegianIdentityErrorDescriber.cs`

**Does.** Replaces the English error messages for password rules with Norwegian ones, so that the backoffice for example shows "Passordet må være minst 10 tegn." instead of "Unknown failure".

**In production.** Yes, for accounts with a local password. Users who log in with Entra ID have no password in Umbraco.

**Traps.**

- Only the password messages are translated. Other errors from ASP.NET Identity, such as lockout, are in English.

### HeadlessPreviewComposer

`Composers/HeadlessPreviewUrlProvider.cs`

**Does.** Builds the preview link in the backoffice: `HeadlessPreview:FrontendUrl`, the path from `content-routes.json` and `?preview=true&secret=` with `HeadlessPreview:PreviewSecret`. Also registers `ContentRouteResolver`, which search and the Malform report use.

**In production.** Yes. `HeadlessPreview__FrontendUrl` is set per environment in `syncroot/`. `HeadlessPreview:PreviewSecret` is not in the repo and comes from the environment's Key Vault.

**Traps.**

- If `FrontendUrl` is missing, the link points to `http://localhost:4321`.
- `PreviewSecret` must equal `PREVIEW_SECRET` in the frontend worker. Otherwise the editor sees only published content.
- `content-routes.json` is mirrored from the frontend with `scripts/sync-content-routes.js`. A content type without a route gets the message "Forhåndsvisning er ikke tilgjengelig".

### MalformComposer

`Malform/`

**Does.** Registers the report behind the "Målform" dashboard in Content, which shows how much of the published content is Nynorsk. The dashboard is in `App_Plugins/Malform/` and fetches the report from `/umbraco/management/api/v1/malform`.

**In production.** Yes, for everyone with access to the Content section.

**Traps.**

- The report uses the text extractor from `SearchComposer`, see the chain above.
- The report is recomputed on every call, over all published content.

## Integrations

### AzureBlobMediaComposer

`Composers/AzureBlobMediaComposer.cs`

**Does.** Puts media in Azure Blob Storage when `Umbraco:Storage:AzureBlob:Media:ConnectionString` is set. Otherwise media is in `wwwroot/media` on disk. The pod authenticates with workload identity, so `ConnectionString` is the endpoint of the storage account and not a key.

**In production.** Yes in both environments. `ConnectionString` and `ContainerName` are set per environment in `syncroot/`.

**Traps.**

- If `ConnectionString` is removed, the CMS puts media on disk in the pod without an error message. The line `[Media] Storage: …` at startup says which storage is used.
- Which source serves a file can be seen from `last-modified`, see "Media files" in [system-documentation.md](system-documentation.md#media-files).

### CachePurgeComposer

`CachePurge/`

**Does.** On publish, unpublish and move to the recycle bin, `FrontendUrlResolver` finds the affected frontend URLs, based on content type and slug, and purges them in Cloudflare in the background. Global settings, a content type without a URL rule, an error in the calculation or more URLs than `AffectedUrlThreshold` (30) give a purge of everything. At startup it logs whether token and zone are set.

**In production.** Yes in prod. The purge requires all three values: `Cloudflare:ApiToken` and `Cloudflare:ZoneId` from Key Vault (`Cloudflare--ApiToken`, `Cloudflare--ZoneId`) and `Cloudflare:SiteBaseUrl`, which is set per environment in `syncroot/`. Whether tt02 has token and zone is shown by the log line at startup there: `Cloudflare cache-purge: Enabled=…, ZoneId=<set>, ApiToken=<set>`. See also [cloudflare-cache-purge.md](cloudflare-cache-purge.md).

**Traps.**

- ki.norge.no and ki.test.norge.no are in the same Cloudflare zone. A purge of everything therefore hits both environments.
- The purge runs after the save has finished. An error is logged, but the editor sees a successful save.
- Without `SiteBaseUrl` nothing is purged, not even on changes to global settings.
- A new content type without a URL rule in `FrontendUrlResolver` gives a purge of everything on every publish.

### SearchComposer

`Search/`

**Does.** Puts published content into the Elasticsearch index `ki-content` on publish, and removes it on unpublish and move to the recycle bin. Also registers a background job and a backoffice route for full reindexing, `search/reindex`, which requires an administrator.

**In production.** Yes in prod. On tt02 search is off on purpose. Prod and tt02 share cluster and index, and it holds prod content, so the CMS on tt02 does not have `Elasticsearch:Endpoint`. Without an endpoint nothing is indexed, and a warning is logged. Endpoint and key are not in the repo and come from the environment's Key Vault (`Elasticsearch--Endpoint`, `Elasticsearch--ApiKey`).

**Traps.**

- Search on tt02 shows prod content.
- A reindex affects both environments.
- The Malform report uses the text extractor from here, also on tt02, where indexing is off.

### OpenTelemetryComposer

`Telemetry/OpenTelemetryComposer.cs`

**Does.** Sends traces over OTLP to `otel-collector` in the cluster. Calls to the backoffice, the management API, preview, static files, media and `/api/health` are not included. Neither are outgoing calls to Key Vault, storage, Microsoft login, Umbraco's own services and the Cloudflare API.

**In production.** Yes in both environments. `OTEL_EXPORTER_OTLP_ENDPOINT` is set in `syncroot/base/umbraco/deployment.yaml`. Locally it is not set, and the composer does nothing.

**Traps.**

- The logs do not go through this composer, but through the Serilog sink in `appsettings.Production.json`. Umbraco clears the log providers at startup, so a log provider registered here would disappear.
