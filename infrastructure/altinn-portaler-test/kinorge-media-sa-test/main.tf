resource "azurerm_resource_group" "main" {
  name     = "kinorge-media-sa-test"
  location = "Norway East"
  tags     = local.tags
}

locals {
  tags = {
    finops_environment = "test"
    finops_product     = "kinorge"
    repository         = "https://github.com/Altinn/info.altinn.no"
    env                = "test"
    product            = "kinorge"
  }
}

module "media_sa" {
  source = "../../modules/kinorge-media-sa"

  environment                       = "test"
  location                          = azurerm_resource_group.main.location
  resource_group_name               = azurerm_resource_group.main.name
  storage_account_base_name         = "kinorgemediatest"
  umbraco_sp_object_id              = var.umbraco_sp_object_id
  blob_reader_group_object_ids      = var.blob_reader_group_object_ids
  blob_contributor_group_object_ids = var.blob_contributor_group_object_ids
  tags                              = local.tags
}
