# syncroot

The Kubernetes manifests for the CMS in Altinn dis-core, in the namespace `product-kinorgeportal`. They are assembled with Kustomize: `base/` has the resources, and `prod/` and `tt02/` add what differs per environment. "Publish Syncroot artifacts" publishes the result, and Flux in the cluster fetches it. See [deploy.md](deploy.md).

## base/umbraco

| File | Contents |
| --- | --- |
| `deployment.yaml` | The pod `umbraco`: one replica, the strategy `Recreate`, port 8080, probes, env and volumes |
| `service.yaml` | The service `umbraco` |
| `httproute.yaml` | Routing from `traefik-gateway`. The hostnames are added per environment |
| `storage.yaml` | `umbraco-data` (Azure Disk, 10Gi, ReadWriteOnce) and `umbraco-media` (Azure Files, 50Gi) |
| `serviceaccount.yaml` | The service account `umbraco` |
| `vault.yaml` | Key Vault for the environment. The address comes in as `KeyVault__AkvUri` |
| `network-policies.yaml` | The Linkerd rules: traffic from Traefik, and the probes from kubelet |

**The volumes.** `umbraco-data` is mounted at `/app/umbraco/Data`, and at `/app/uSync/v17/Content`, so the content export from uSync survives a restart. `umbraco-media` is deliberately not mounted. Media lives in Azure Blob, see "Media files" in [system-documentation.md](system-documentation.md#media-files). The comments in `deployment.yaml` explain why.

**The user.** The container runs as `app` (UID 1654), and `fsGroup: 1654` makes the volumes writable for it.

## prod and tt02

Each overlay sets the image name, and adds:

- the hostnames in `HTTPRoute`
- `UmbracoApplicationUrl` and `BackOfficeHost`
- the storage account for media (`Umbraco__Storage__AzureBlob__Media__*`)
- `HeadlessPreview__FrontendUrl` and `Cloudflare__SiteBaseUrl`
- `USYNC_OWNS_SCHEMA=true` and `uSync__Settings__ImportAtStartup`. Prod imports `Settings`, tt02 `Settings,Content`. tt02 also uses the uSync set `Speiling`, see [content-mirroring-tt02.md](content-mirroring-tt02.md).

The image tag is set to `will-be-replaced`. "Publish Syncroot artifacts" sets the tag and the digest it points to.
