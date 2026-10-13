Historisk, flyttet fra CLAUDE.md 2026-10-13. Beskriver driften før Altinn dis-core og Cloudflare Workers, og gjelder ikke lenger.

# Azure Container Apps (utgått)

Før CMS-et flyttet til Altinn dis-core og frontenden til Cloudflare Workers, kjørte begge som Azure Container Apps.

- Én ressursgruppe med et Container Apps-miljø og to apper, `ki-norge-frontend` og `ki-norge-cms`.
- Images i et eget Azure Container Registry, og en lagringskonto for Litestream og media.
- CMS-et brukte SQLite, kopiert til Azure Blob med Litestream (v0.3.14). Det ga låsekonflikter når flere redaktører jobbet samtidig, og ble erstattet av Azure SQL i dis-core. Se [sql-server-migration-plan.md](../sql-server-migration-plan.md).
- Deployen gikk med `scripts/deploy-azure.sh`. URL-ene ble byttet ut i #338, og skriptene ble slettet i #477.
