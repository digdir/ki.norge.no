variable "environment" {
  description = "Environment name (e.g. test, prod)"
  type        = string
}

variable "location" {
  description = "Azure region for the storage account"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the Azure resource group"
  type        = string
}

variable "storage_account_base_name" {
  description = "Base name for the storage account — a 4-char random suffix is appended (total max 24 chars, lowercase alphanumeric)"
  type        = string
}

variable "umbraco_sp_object_id" {
  description = "Object ID of the umbraco-kinorge managed identity granted Storage Blob Data Contributor. Leave empty to skip the role assignment."
  type        = string
  default     = ""
}

variable "blob_reader_group_object_ids" {
  description = "List of Azure AD group object IDs granted Storage Blob Data Reader on the storage account."
  type        = list(string)
  default     = []
}

variable "blob_contributor_group_object_ids" {
  description = "List of Azure AD group object IDs granted Storage Blob Data Contributor on the storage account."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to all taggable resources"
  type        = map(string)
  default     = {}
}
