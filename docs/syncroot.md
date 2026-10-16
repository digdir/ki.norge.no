# syncroot

Kubernetes-manifestene for CMS-et i Altinn dis-core, i namespace `product-kinorgeportal`. De settes sammen med Kustomize: `base/` har ressursene, og `prod/` og `tt02/` legger på det som er ulikt per miljø. «Publish Syncroot artifacts» publiserer resultatet, og Flux i klyngen henter det. Se [deploy.md](deploy.md).

## base/umbraco

| Fil | Innhold |
| --- | --- |
| `deployment.yaml` | Podden `umbraco`: én replika, strategien `Recreate`, port 8080, prober, env og volumer |
| `service.yaml` | Tjenesten `umbraco` |
| `httproute.yaml` | Ruting fra `traefik-gateway`. Hostnavnene legges på per miljø |
| `storage.yaml` | `umbraco-data` (Azure Disk, 10Gi, ReadWriteOnce) og `umbraco-media` (Azure Files, 50Gi) |
| `serviceaccount.yaml` | Tjenestekontoen `umbraco` |
| `vault.yaml` | Key Vault for miljøet. Adressen kommer inn som `KeyVault__AkvUri` |
| `network-policies.yaml` | Linkerd-reglene: trafikk fra Traefik, og probene fra kubelet |

**Volumene.** `umbraco-data` er montert på `/app/umbraco/Data`, og på `/app/uSync/v17/Content`, så innholdseksporten fra uSync overlever en omstart. `umbraco-media` er bevisst ikke montert. Media ligger i Azure Blob, se «Mediefiler» i [systemdokumentasjon.md](systemdokumentasjon.md). Kommentarene i `deployment.yaml` forklarer hvorfor.

**Brukeren.** Containeren kjører som `app` (UID 1654), og `fsGroup: 1654` gjør volumene skrivbare for den.

## prod og tt02

Hvert overlay setter image-navnet, og legger på:

- hostnavnene i `HTTPRoute`
- `UmbracoApplicationUrl` og `BackOfficeHost`
- lagringskontoen for media (`Umbraco__Storage__AzureBlob__Media__*`)
- `HeadlessPreview__FrontendUrl` og `Cloudflare__SiteBaseUrl`
- `USYNC_OWNS_SCHEMA=true` og `uSync__Settings__ImportAtStartup`. Prod importerer `Settings`, tt02 `Settings,Content`. tt02 bruker i tillegg uSync-settet `Speiling`, se [innholdsspeiling-tt02.md](innholdsspeiling-tt02.md).

Image-taggen står som `will-be-replaced`. «Publish Syncroot artifacts» setter taggen og digesten den peker på.
