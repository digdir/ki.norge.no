resource "azurerm_resource_group" "main" {
  name     = "kinorge-media-sa-prod"
  location = "Norway East"
  tags     = local.tags
}

locals {
  tags = {
    finops_environment = "prod"
    finops_product     = "kinorge"
    repository         = "https://github.com/Altinn/info.altinn.no"
    env                = "prod"
    product            = "kinorge"
  }
}

module "media_sa" {
  source = "../../modules/kinorge-media-sa"

  environment                       = "prod"
  location                          = azurerm_resource_group.main.location
  resource_group_name               = azurerm_resource_group.main.name
  storage_account_base_name         = "kinorgemediaprod"
  umbraco_sp_object_id              = var.umbraco_sp_object_id
  blob_reader_group_object_ids      = var.blob_reader_group_object_ids
  blob_contributor_group_object_ids = var.blob_contributor_group_object_ids
  tags                              = local.tags
}
