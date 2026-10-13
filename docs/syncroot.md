# Info Portalen (Umbraco) Infrastructure

This directory contains the Kubernetes manifests for the Umbraco CMS implementation of the Info Portalen project.

## TODO
There are still things that needs to be done before this can be deployed.
In `syncroot/at22/kustomization.yaml` the team need to define the image name (container registry + repository) and a valid image tag. The current setup is just a dumme value that will not work.

There are still some questions regarding storage and backup. This setup should get you going once you have a public available docker image of umbraco that can be deployed.

I have disbaled the push trigger for the pipeline so it shouldn't publish an deployment before the docker image todos are done.

## Folder Structure

- **base/**: Contains the base Kubernetes resources for the Umbraco stack.
  - **umbraco/**:
    - `deployment.yaml`: Defines the Umbraco pod with single replica and `Recreate` strategy.
    - `service.yaml`: ClusterIP service for internal routing.
    - `httproute.yaml`: Gateway API routing for external access.
    - `storage.yaml`: Persistent Volume Claims for data and media.
    - `serviceaccount.yaml`: Dedicated service account for the Umbraco pod.
    - `kustomization.yaml`: Orchestrates the resources and applies common labels.
- **at22/**: Kustomize overlay for the AT22 environment.
  - `kustomization.yaml`: Applies environment-specific patches (e.g., hostnames, image tags).
- **tt02/**: Kustomize overlay for the TT02 environment.
- **prod/**: Kustomize overlay for the Production environment.

## Resources Created

### Deployment
- **Name**: `umbraco`
- **Namespace**: `product-infoportal` (inherited from base kustomization)
- **Replicas**: 1
- **Strategy**: `Recreate` (required for RWO storage)
- **Port**: 8080 (named `http`)

### Storage (PVCs)
1. **umbraco-data**: 
   - **Size**: 10Gi
   - **StorageClass**: `managed-csi-premium` (Azure Disk)
   - **Mount Path**: `/app/umbraco/Data`
   - **Access Mode**: `ReadWriteOnce`
2. **umbraco-media**:
   - **Size**: 50Gi
   - **StorageClass**: `azurefile-csi-premium` (Azure Files)
   - **Mount Path**: `/app/umbraco/wwwroot/media`
   - **Access Mode**: `ReadWriteMany`
3. **Logs**:
   - **Type**: `emptyDir`
   - **Mount Path**: `/app/umbraco/Logs`

### Networking
- **Service**: ClusterIP on port 80 (targets container port 8080).
- **HTTPRoute**: Routes traffic via `traefik-gateway` in the `traefik` namespace.
  - **AT22 Hostname**: `infoportal.at22.dis-core.altinn.cloud`

### Identity
- **ServiceAccount**: `umbraco` (no additional permissions assigned).

## Labels
Resources are consistently labeled using Kustomize `commonLabels`:
- `app.kubernetes.io/name: umbraco`
- `app.kubernetes.io/part-of: infoportal`
