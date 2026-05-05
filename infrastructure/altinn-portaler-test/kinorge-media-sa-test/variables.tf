variable "umbraco_sp_object_id" {
  description = "Object ID of the umbraco-kinorge managed identity that reads/writes media files in the storage account. Leave empty to skip the role assignment."
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
