# Set umbraco_sp_object_id once the umbraco-kinorge workload identity (UAMI tied to the
# umbraco-kinorge service account) has been provisioned in the prod cluster.
umbraco_sp_object_id = ""

blob_reader_group_object_ids = [
  "9d64c20c-250b-4976-be0d-237374413cac", # DIS AKS Reader Dev IP
]

blob_contributor_group_object_ids = [
  "42688626-6503-4d1d-8aa4-e1e5fef2b4be", # DIS AKS Admin Dev IP
]
