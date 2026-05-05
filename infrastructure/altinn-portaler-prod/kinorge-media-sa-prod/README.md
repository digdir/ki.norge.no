# kinorge-media-sa-prod

Provisions an Azure Storage Account for the umbraco-kinorge CMS media files in the production environment.

## What this creates

- **Azure Resource Group** `kinorge-media-sa-prod`
- **Azure Storage Account** `kinorgemediaprod<random>` (Standard ZRS, Norway East)
  - Shared key access disabled — workload identity only
  - Blob versioning enabled
- **Blob container** `umbraco` — holds Umbraco's `/media` and `/cache` folders
- RBAC role assignment granting `Storage Blob Data Contributor` to the umbraco-kinorge service principal (optional, set `umbraco_sp_object_id` to enable)

## Configuring umbraco-kinorge

umbraco-kinorge connects via AKS Workload Identity using `DefaultAzureCredential` — the shared `Portals.Shared.Composers.AzureBlobFileSystemComposer` (added in Task 9) handles registration.

### 1. Enable the role assignment

After the umbraco-kinorge service account is bound to a UAMI in the prod cluster, set its object ID in `terraform.tfvars`:

```hcl
umbraco_sp_object_id = "<object-id>"
```

### 2. Kustomization env var

The blob service URI is injected via the kustomize overlay at `syncroot/kinorge-prod/`:

```yaml
- name: Umbraco__Storage__AzureBlob__Media__ConnectionString
  value: https://<storage-account-name>.blob.core.windows.net
```

The container name defaults to `umbraco`.

## Deploying

```bash
terraform init
terraform plan
terraform apply
```

The legacy Container App-era storage account (`kinorgestorage`) is not touched by this module — it stays in place until Task 13 verifies the new model and the historical Litestream blobs are no longer needed.
