output "storage_account_name" {
  description = "Name of the media storage account"
  value       = azurerm_storage_account.media.name
}

output "storage_account_id" {
  description = "Resource ID of the media storage account"
  value       = azurerm_storage_account.media.id
}

output "primary_blob_endpoint" {
  description = "Primary blob service endpoint URL"
  value       = azurerm_storage_account.media.primary_blob_endpoint
}

output "container_name" {
  description = "Name of the blob container used by Umbraco (holds /media and /cache folders)"
  value       = azurerm_storage_container.media.name
}
