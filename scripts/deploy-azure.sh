#!/usr/bin/env bash
set -euo pipefail

# Deploy ki.norge.no to Azure Container Apps
# Usage: ./scripts/deploy-azure.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Configuration
RESOURCE_GROUP="ki-norge"
LOCATION="norwayeast"
CONTAINERAPPS_ENV="ki-norge-no-env"
ACR_NAME="kinorgeacr"
UMBRACO_APP_NAME="ki-norge-cms"
FRONTEND_APP_NAME="ki-norge-frontend"
STORAGE_ACCOUNT="kinorgestorage"
BLOB_CONTAINER="umbraco-db"
IMAGE_TAG="$(date +%Y%m%d%H%M%S)"

# Guard: refuse to run after the K8s cutover. cms.ki.norge.no currently CNAMEs
# to ki-norge-cms.greentree-c9e56a64.norwayeast.azurecontainerapps.io. When the
# K8s deploy via .github/workflows/publish-syncroot-main.yaml takes over, the
# CNAME will change and this script should not target the orphan Container App.
# (No-op if dig fails or the host can't resolve DNS — only blocks on a
# definitive non-Container-Apps answer.)
_CUTOVER_CNAME="$(dig +short CNAME cms.ki.norge.no 2>/dev/null || true)"
if [ -n "$_CUTOVER_CNAME" ] && ! echo "$_CUTOVER_CNAME" | grep -q "azurecontainerapps"; then
  echo "ERROR: K8s cutover detected (cms.ki.norge.no CNAME = ${_CUTOVER_CNAME})."
  echo "This script targets the legacy Container Apps deploy and is deprecated."
  echo "Use the K8s flow via .github/workflows/publish-syncroot-main.yaml instead."
  exit 1
fi

# Ensure Azure auth + PIM activation before deploying
# Handles: expired MFA, wrong tenant, missing subscription, PIM activation
TENANT_ID="cd0026d8-283b-4a55-9bfa-d0ef4a8ba21c"
SUBSCRIPTION_ID="fdc58270-273a-4afc-b996-83e97fe5173a"
PRINCIPAL_ID="3beaadb7-8bbb-4396-9773-8843fa1b2057"
ROLE_DEF_ID="/subscriptions/${SUBSCRIPTION_ID}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c"

echo "==> Checking Azure authentication..."

# Check if we can already access the subscription
if az account show --query name -o tsv 2>/dev/null | grep -q "Altinn"; then
  echo "  Already authenticated with subscription access."
else
  # Try to get a token from current session
  _TOKEN=$(az account get-access-token --resource https://management.azure.com --query accessToken -o tsv 2>/dev/null || true)

  if [ -z "$_TOKEN" ]; then
    # No token at all — need full login with MFA to the correct tenant
    echo "  No Azure session. Logging in to tenant ${TENANT_ID}..."
    az login --tenant "${TENANT_ID}" --allow-no-subscriptions
    _TOKEN=$(az account get-access-token --resource https://management.azure.com --query accessToken -o tsv 2>/dev/null || true)
  fi

  if [ -z "$_TOKEN" ]; then
    echo "  ERROR: Could not get Azure access token. Run 'az login' manually."
    exit 1
  fi

  # Check if token is for the right tenant
  _ISSUER=$(echo "$_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('tid',''))" 2>/dev/null || true)
  if [ -n "$_ISSUER" ] && [ "$_ISSUER" != "$TENANT_ID" ]; then
    echo "  Wrong tenant (${_ISSUER}). Re-logging to ${TENANT_ID}..."
    az login --tenant "${TENANT_ID}" --allow-no-subscriptions
    _TOKEN=$(az account get-access-token --resource https://management.azure.com --query accessToken -o tsv)
  fi

  # Activate PIM
  echo "  Activating PIM role..."
  _PIM_RESULT=$(curl -s -X PUT \
    "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/providers/Microsoft.Authorization/roleAssignmentScheduleRequests/$(uuidgen)?api-version=2020-10-01" \
    -H "Authorization: Bearer $_TOKEN" -H "Content-Type: application/json" \
    -d "{\"properties\":{\"principalId\":\"${PRINCIPAL_ID}\",\"roleDefinitionId\":\"${ROLE_DEF_ID}\",\"requestType\":\"SelfActivate\",\"justification\":\"Deploy ki.norge.no\",\"scheduleInfo\":{\"expiration\":{\"type\":\"AfterDuration\",\"duration\":\"PT8H\"}}}}" 2>/dev/null)
  echo "  PIM: $(echo "$_PIM_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('properties',{}).get('status', d.get('error',{}).get('message','OK')))" 2>/dev/null || echo "activated")"

  # Wait for PIM propagation then re-login to see subscription
  echo "  Waiting for PIM propagation..."
  sleep 12
  az login >/dev/null 2>&1

  # Verify
  if ! az account show --query name -o tsv 2>/dev/null | grep -q "Altinn"; then
    echo "  ERROR: Subscription still not visible after PIM activation."
    echo "  Try running manually: az login --tenant ${TENANT_ID}"
    exit 1
  fi
fi
echo "OK"

echo "=== ki.norge.no Azure deployment ==="
echo "Resource group: ${RESOURCE_GROUP}"
echo "Location: ${LOCATION}"
echo "Image tag: ${IMAGE_TAG}"
echo

# --- Prerequisites ---
echo "==> Registering Azure providers..."
az extension add --name containerapp --upgrade --only-show-errors 2>/dev/null || true
az provider register --namespace Microsoft.App --wait >/dev/null 2>&1 || echo "  (skipped Microsoft.App — already registered or insufficient permissions)"
az provider register --namespace Microsoft.OperationalInsights --wait >/dev/null 2>&1 || echo "  (skipped Microsoft.OperationalInsights)"
az provider register --namespace Microsoft.ContainerRegistry --wait >/dev/null 2>&1 || echo "  (skipped Microsoft.ContainerRegistry)"
echo "OK"

# --- Resource group ---
echo "==> Ensuring resource group: ${RESOURCE_GROUP}"
az group show --name "${RESOURCE_GROUP}" >/dev/null 2>&1 || \
  az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" >/dev/null
echo "OK"

# --- Container Registry ---
echo "==> Ensuring container registry: ${ACR_NAME}"
if ! az acr show --resource-group "${RESOURCE_GROUP}" --name "${ACR_NAME}" >/dev/null 2>&1; then
  az acr create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${ACR_NAME}" \
    --location "${LOCATION}" \
    --sku Basic \
    --admin-enabled true >/dev/null
fi
az acr update --resource-group "${RESOURCE_GROUP}" --name "${ACR_NAME}" --admin-enabled true --only-show-errors >/dev/null
echo "OK"

ACR_LOGIN_SERVER="$(az acr show --resource-group "${RESOURCE_GROUP}" --name "${ACR_NAME}" --query loginServer -o tsv)"
ACR_USERNAME="$(az acr credential show --resource-group "${RESOURCE_GROUP}" --name "${ACR_NAME}" --query username -o tsv)"
ACR_PASSWORD="$(az acr credential show --resource-group "${RESOURCE_GROUP}" --name "${ACR_NAME}" --query passwords[0].value -o tsv)"

UMBRACO_IMAGE="${ACR_LOGIN_SERVER}/ki-norge/cms:${IMAGE_TAG}"
FRONTEND_IMAGE="${ACR_LOGIN_SERVER}/ki-norge/frontend:${IMAGE_TAG}"

# --- Storage account for Litestream ---
echo "==> Ensuring storage account: ${STORAGE_ACCOUNT}"
if ! az storage account show --name "${STORAGE_ACCOUNT}" --resource-group "${RESOURCE_GROUP}" >/dev/null 2>&1; then
  az storage account create \
    --name "${STORAGE_ACCOUNT}" \
    --resource-group "${RESOURCE_GROUP}" \
    --location "${LOCATION}" \
    --sku Standard_LRS >/dev/null
fi
echo "OK"

echo "==> Ensuring blob container: ${BLOB_CONTAINER}"
STORAGE_KEY="$(az storage account keys list --account-name "${STORAGE_ACCOUNT}" --resource-group "${RESOURCE_GROUP}" --query "[0].value" -o tsv)"
az storage container create \
  --name "${BLOB_CONTAINER}" \
  --account-name "${STORAGE_ACCOUNT}" \
  --account-key "${STORAGE_KEY}" \
  --only-show-errors >/dev/null 2>&1 || true
echo "OK"

# --- Re-set environment storage account key (idempotent, prevents recurring VolumeMountFailure) ---
# Background: Container Apps env-level storage definitions occasionally lose their account key
# (Azure quirk seen 2026-04-30). When this happens, the file mount fails with "Permission denied"
# and the container can't start. Setting the key on every deploy is cheap insurance.
echo "==> Refreshing env storage account key for media mount"
az containerapp env storage set \
  --name "${CONTAINERAPPS_ENV}" \
  --resource-group "${RESOURCE_GROUP}" \
  --storage-name umbracomedia \
  --azure-file-account-name "${STORAGE_ACCOUNT}" \
  --azure-file-account-key "${STORAGE_KEY}" \
  --azure-file-share-name umbraco-data \
  --access-mode ReadWrite >/dev/null 2>&1 || echo "  (storage 'umbracomedia' not yet defined — manual setup required first time)"
echo "OK"

# --- Tag currently-deployed image as :prev for rollback ---
# Pulls digest of whatever's running now and re-tags it as :prev so we can
# roll back fast if the new image breaks. Best-effort — fails quietly on
# first deploy or if no current image exists.
echo "==> Tagging current images as :prev for rollback safety"
for app in cms frontend; do
  case "$app" in
    cms) current_ref=$(az containerapp show -g "${RESOURCE_GROUP}" -n "${UMBRACO_APP_NAME}" --query "properties.template.containers[0].image" -o tsv 2>/dev/null | sed "s|${ACR_NAME}.azurecr.io/||") ;;
    frontend) current_ref=$(az containerapp show -g "${RESOURCE_GROUP}" -n "${FRONTEND_APP_NAME}" --query "properties.template.containers[0].image" -o tsv 2>/dev/null | sed "s|${ACR_NAME}.azurecr.io/||") ;;
  esac
  if [ -n "${current_ref:-}" ]; then
    az acr import --name "${ACR_NAME}" --source "${ACR_NAME}.azurecr.io/${current_ref}" --image "ki-norge/${app}:prev" --force >/dev/null 2>&1 \
      && echo "  ${app}: ${current_ref} → :prev" \
      || echo "  ${app}: skip (no previous image)"
  else
    echo "  ${app}: skip (first deploy)"
  fi
done

# --- Build images (remote ACR build) ---
echo "==> Building CMS image: ${UMBRACO_IMAGE}"
az acr build \
  --registry "${ACR_NAME}" \
  --image "ki-norge/cms:${IMAGE_TAG}" \
  --file "${REPO_ROOT}/apps/cms-umbraco/Dockerfile" \
  "${REPO_ROOT}/apps/cms-umbraco" 2>&1 | tail -5
echo "OK"

echo "==> Building frontend image: ${FRONTEND_IMAGE}"
az acr build \
  --registry "${ACR_NAME}" \
  --image "ki-norge/frontend:${IMAGE_TAG}" \
  --file "${REPO_ROOT}/apps/frontend/Dockerfile" \
  "${REPO_ROOT}" 2>&1 | tail -5
echo "OK"

# --- Container Apps Environment ---
echo "==> Ensuring Container Apps environment: ${CONTAINERAPPS_ENV}"
if ! az containerapp env show --resource-group "${RESOURCE_GROUP}" --name "${CONTAINERAPPS_ENV}" >/dev/null 2>&1; then
  az containerapp env create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${CONTAINERAPPS_ENV}" \
    --location "${LOCATION}" >/dev/null
fi
echo "OK"

# --- Secrets (only generate on first deploy, reuse existing) ---
CMS_EXISTS=false
if az containerapp show --resource-group "${RESOURCE_GROUP}" --name "${UMBRACO_APP_NAME}" >/dev/null 2>&1; then
  CMS_EXISTS=true
fi

FRONTEND_EXISTS=false
if az containerapp show --resource-group "${RESOURCE_GROUP}" --name "${FRONTEND_APP_NAME}" >/dev/null 2>&1; then
  FRONTEND_EXISTS=true
fi

if [ "${CMS_EXISTS}" = false ]; then
  DELIVERY_API_KEY="$(openssl rand -base64 32 | tr -d '\n')"
  PREVIEW_SECRET="$(openssl rand -base64 32 | tr -d '\n')"
  echo
  echo "Generated new secrets (save these):"
  echo "  DELIVERY_API_KEY: ${DELIVERY_API_KEY}"
  echo "  PREVIEW_SECRET:   ${PREVIEW_SECRET}"
  echo
fi

# --- Deploy CMS ---
echo "==> Deploying CMS: ${UMBRACO_APP_NAME}"
if [ "${CMS_EXISTS}" = true ]; then
  # Update existing — use YAML to reliably set all env vars
  az containerapp secret set \
    --name "${UMBRACO_APP_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --secrets "litestream-azure-account-key=${STORAGE_KEY}" \
    --only-show-errors >/dev/null 2>&1 || true

  cat > /tmp/cms-deploy.yaml <<YAMLDOC
properties:
  template:
    containers:
    - env:
      - name: ASPNETCORE_ENVIRONMENT
        value: Production
      - name: ASPNETCORE_URLS
        value: http://0.0.0.0:8080
      - name: ASPNETCORE_FORWARDEDHEADERS_ENABLED
        value: 'true'
      - name: ConnectionStrings__umbracoDbDSN
        # Default Timeout=30 sets SQLite busy_timeout to 30s — without this, any
        # write that collides with a Litestream WAL checkpoint or another writer
        # fails immediately with "database is locked" / "table is locked".
        # Litestream docs explicitly recommend >=5s; 30s gives plenty of headroom.
        value: Data Source=/app/umbraco/Data/Umbraco.sqlite.db;Cache=Shared;Foreign Keys=True;Pooling=True;Default Timeout=30
      - name: ConnectionStrings__umbracoDbDSN_ProviderName
        value: Microsoft.Data.Sqlite
      - name: UMBRACO__CMS__DELIVERYAPI__ENABLED
        value: 'true'
      - name: UMBRACO__CMS__DELIVERYAPI__PUBLICACCESS
        value: 'true'
      - name: UMBRACO__CMS__DELIVERYAPI__APIKEY
        secretRef: delivery-api-key
      - name: UMBRACO__CMS__DELIVERYAPI__RICHTEXTOUTPUTASJSON
        value: 'true'
      - name: UMBRACO__CMS__GLOBAL__MAINDOMLOCK
        value: FileSystemMainDomLock
      - name: UMBRACO__CMS__UNATTENDED__INSTALLUNATTENDED
        value: 'true'
      - name: UMBRACO__CMS__UNATTENDED__UPGRADEUNATTENDED
        value: 'true'
      - name: UMBRACO__CMS__UNATTENDED__UNATTENDEDUSERNAME
        value: 'admin'
      - name: UMBRACO__CMS__UNATTENDED__UNATTENDEDUSEREMAIL
        value: 'admin@ki.norge.no'
      - name: UMBRACO__CMS__UNATTENDED__UNATTENDEDUSERPASSWORD
        value: 'KiNorge2025!'
      - name: LITESTREAM_AZURE_ACCOUNT_KEY
        secretRef: litestream-azure-account-key
      - name: Serilog__MinimumLevel__Default
        value: Information
      - name: Serilog__WriteTo__0__Name
        value: Console
      - name: HeadlessPreview__FrontendUrl
        value: https://ki-norge-frontend.greentree-c9e56a64.norwayeast.azurecontainerapps.io
      - name: HeadlessPreview__PreviewSecret
        value: '59cfdda7b9140784c3c80149b5348d81'
      - name: LAUNCH_MODE
        value: production
      image: ${UMBRACO_IMAGE}
      name: ki-norge-cms
      volumeMounts:
      - volumeName: umbracomedia
        mountPath: /app/wwwroot/media
      resources:
        cpu: 0.5
        memory: 1Gi
      probes:
      - type: liveness
        httpGet:
          path: /api/health
          port: 8080
        initialDelaySeconds: 60
        periodSeconds: 30
        failureThreshold: 10
      - type: readiness
        httpGet:
          path: /api/health/ready
          port: 8080
        initialDelaySeconds: 60
        periodSeconds: 30
        failureThreshold: 10
    volumes:
    - name: umbracomedia
      storageName: umbracomedia
      storageType: AzureFile
YAMLDOC

  az containerapp update \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${UMBRACO_APP_NAME}" \
    --yaml /tmp/cms-deploy.yaml >/dev/null
  rm -f /tmp/cms-deploy.yaml
else
  az containerapp create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${UMBRACO_APP_NAME}" \
    --environment "${CONTAINERAPPS_ENV}" \
    --image "${UMBRACO_IMAGE}" \
    --ingress external \
    --target-port 8080 \
    --min-replicas 1 \
    --max-replicas 1 \
    --registry-server "${ACR_LOGIN_SERVER}" \
    --registry-username "${ACR_USERNAME}" \
    --registry-password "${ACR_PASSWORD}" \
    --secrets \
      "delivery-api-key=${DELIVERY_API_KEY}" \
      "preview-secret=${PREVIEW_SECRET}" \
      "litestream-azure-account-key=${STORAGE_KEY}" \
    --env-vars \
      "ASPNETCORE_ENVIRONMENT=Production" \
      "ASPNETCORE_URLS=http://0.0.0.0:8080" \
      "ASPNETCORE_FORWARDEDHEADERS_ENABLED=true" \
      "ConnectionStrings__umbracoDbDSN=Data Source=/app/umbraco/Data/Umbraco.sqlite.db;Cache=Shared;Foreign Keys=True;Pooling=True;Default Timeout=30" \
      "ConnectionStrings__umbracoDbDSN_ProviderName=Microsoft.Data.Sqlite" \
      "UMBRACO__CMS__DELIVERYAPI__ENABLED=true" \
      "UMBRACO__CMS__DELIVERYAPI__PUBLICACCESS=true" \
      "UMBRACO__CMS__DELIVERYAPI__APIKEY=secretref:delivery-api-key" \
      "UMBRACO__CMS__DELIVERYAPI__RICHTEXTOUTPUTASJSON=true" \
      "UMBRACO__CMS__GLOBAL__MAINDOMLOCK=FileSystemMainDomLock" \
      "UMBRACO__CMS__UNATTENDED__INSTALLUNATTENDED=true" \
      "UMBRACO__CMS__UNATTENDED__UNATTENDEDUSERNAME=admin" \
      "UMBRACO__CMS__UNATTENDED__UNATTENDEDUSEREMAIL=admin@ki.norge.no" \
      "UMBRACO__CMS__UNATTENDED__UNATTENDEDUSERPASSWORD=KiNorge2025!" \
      "LITESTREAM_AZURE_ACCOUNT_KEY=secretref:litestream-azure-account-key" \
      "Serilog__MinimumLevel__Default=Information" \
      "Serilog__WriteTo__0__Name=Console" \
    >/dev/null
fi

az containerapp revision set-mode \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${UMBRACO_APP_NAME}" \
  --mode single >/dev/null 2>&1 || true

UMBRACO_FQDN="$(az containerapp show --resource-group "${RESOURCE_GROUP}" --name "${UMBRACO_APP_NAME}" --query properties.configuration.ingress.fqdn -o tsv)"
echo "OK — CMS URL: https://${UMBRACO_FQDN}"

# --- Deploy Frontend ---
CONTAINERAPPS_DEFAULT_DOMAIN="$(az containerapp env show --resource-group "${RESOURCE_GROUP}" --name "${CONTAINERAPPS_ENV}" --query properties.defaultDomain -o tsv)"
UMBRACO_INTERNAL_URL="https://${UMBRACO_APP_NAME}.internal.${CONTAINERAPPS_DEFAULT_DOMAIN}"

echo "==> Deploying frontend: ${FRONTEND_APP_NAME}"
if [ "${FRONTEND_EXISTS}" = true ]; then
  az containerapp update \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${FRONTEND_APP_NAME}" \
    --image "${FRONTEND_IMAGE}" >/dev/null
else
  az containerapp create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${FRONTEND_APP_NAME}" \
    --environment "${CONTAINERAPPS_ENV}" \
    --image "${FRONTEND_IMAGE}" \
    --ingress external \
    --target-port 4321 \
    --min-replicas 1 \
    --max-replicas 3 \
    --registry-server "${ACR_LOGIN_SERVER}" \
    --registry-username "${ACR_USERNAME}" \
    --registry-password "${ACR_PASSWORD}" \
    --secrets "delivery-api-key=${DELIVERY_API_KEY}" "preview-secret=${PREVIEW_SECRET}" \
    --env-vars \
      "HOST=0.0.0.0" \
      "PORT=4321" \
      "UMBRACO_URL=${UMBRACO_INTERNAL_URL}" \
      "UMBRACO_API_KEY=secretref:delivery-api-key" \
      "PREVIEW_SECRET=secretref:preview-secret" \
      "SITE_URL=https://${FRONTEND_APP_NAME}.${CONTAINERAPPS_DEFAULT_DOMAIN}" \
    >/dev/null
fi

# Configure health probes
az containerapp update \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${FRONTEND_APP_NAME}" \
  --set-env-vars "ADMIN_SECRET=secretref:admin-secret" 2>/dev/null || true
az containerapp update \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${FRONTEND_APP_NAME}" \
  --yaml /dev/stdin >/dev/null 2>&1 <<PROBES || true
properties:
  template:
    containers:
    - name: ${FRONTEND_APP_NAME}
      probes:
      - type: liveness
        httpGet:
          path: /api/health
          port: 4321
        periodSeconds: 30
        failureThreshold: 3
      - type: readiness
        httpGet:
          path: /api/health/ready
          port: 4321
        periodSeconds: 30
        failureThreshold: 3
PROBES

FRONTEND_FQDN="$(az containerapp show --resource-group "${RESOURCE_GROUP}" --name "${FRONTEND_APP_NAME}" --query properties.configuration.ingress.fqdn -o tsv)"
echo "OK — Frontend URL: https://${FRONTEND_FQDN}"

echo
echo "=== Deployment complete ==="
echo "CMS:      https://${UMBRACO_FQDN}"
echo "Frontend: https://${FRONTEND_FQDN}"
