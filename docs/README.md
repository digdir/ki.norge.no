# Documentation for ki.norge.no

ki.norge.no is the portal for artificial intelligence in the public sector, run by Digitaliseringsdirektoratet. The editorial team writes the content in Umbraco, which runs in Altinn dis-core, and an Astro frontend on Cloudflare Workers displays it. Search runs against Elastic Cloud.

## For operations

- [System documentation](system-documentation.md): how the parts fit together, the environments and the health check.
- [Deploy](deploy.md): how new versions are released, and in which order.
- [Content mirroring to tt02](content-mirroring-tt02.md): how content is copied from prod to tt02.
- [Dependencies](dependencies.md): where the dependencies live, and how they are updated.
- [Composers in the CMS](cms-composers.md): what runs in the CMS, and which config turns it on.
- [Cache purge](cloudflare-cache-purge.md): how the Cloudflare cache is purged when something is published.

## The rest

All the documents are listed in [llms.txt](llms.txt), with one line each. The decision log and the reports are in [reports/](reports/).
