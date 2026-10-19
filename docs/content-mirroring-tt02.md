# Content mirroring from prod to tt02

tt02 should resemble prod when a change is to be tried there. The schema comes along by itself, but the content is copied by hand, one way, from prod to tt02.

## What comes along

- **The schema** is owned by uSync in both environments (`USYNC_OWNS_SCHEMA=true`). The schema files are in the image, and uSync imports them on every startup. It is not part of the mirroring.
- **The content**, meaning nodes and media metadata, is exported in prod and imported in tt02.
- **The image files do not come along.** They are in Azure Blob, in a separate storage account per environment, and there is no script that copies them from prod to tt02. Images in mirrored content are therefore missing on tt02.

## The setup

| | prod | tt02 |
| --- | --- | --- |
| uSync set | `Default`: export of content and media, import and export of schema | `Speiling`: import and export of everything |
| `ImportAtStartup` | `Settings` | `Settings,Content` |

The content folder `/app/uSync/v17/Content` is persistent in both environments, on the volume `umbraco-data`. The media metadata in `v17/Media` is on the container's writable layer and disappears on restart.

On tt02 this means that every startup imports the latest content that was copied there. Changes to mirrored nodes on tt02 are reset on the next restart. Nodes that only exist on tt02 are left alone. If tt02 should rather be a place to try things, `ImportAtStartup` is set back to `Settings` in `syncroot/tt02/kustomization.yaml`.

The configuration is under `uSync` in `apps/cms-umbraco/appsettings.json` and in `syncroot/prod` and `syncroot/tt02`.

## Prerequisites

- Admin in the backoffice in both environments
- The kubectl contexts `dis-core-prod-aks` and `dis-core-tt02-aks`, with the Altinn VPN
- tt02 runs the same or a newer image than prod, never older

## Mirroring round

1. In the prod backoffice: Settings, uSync, **Export**.
2. Copy the export from your machine:

   ```bash
   scripts/sync-prod-til-tt02.sh --sjekk   # show the number of files and the newest file, copy nothing
   scripts/sync-prod-til-tt02.sh           # copy, asks first
   ```

   The script copies `v17/Content`, and `v17/Media` when it exists, pod to pod through your machine. The schema files do not come along, because an older schema export from prod could roll back a newer schema on tt02 and delete fields. `-y` skips the confirmation. Contexts and namespaces can be overridden with `PROD_CTX`, `TT02_CTX`, `NS`, `POD` and `CONTAINER`.

3. In the tt02 backoffice: Settings, uSync, **Import**. Never clean.

The content folder on prod is persistent, so it may hold an old export. Look at the time of the newest file the script shows before you copy.

## Rules

- Content is never imported in prod, it is only exported from there.
- Clean import is never used. It deletes nodes that are not in the export.
- Import is an upsert on GUID. Nodes deleted in prod remain on tt02.
- Drafts in prod come along with the export and show up as drafts on tt02.
- Import publishes again, so the publish handlers run for everything imported. Search indexing is off on tt02.
- Test content on tt02 is named with the prefix TEST. Fixed test articles are kept as files in git, see [uSync-testinnhold/README.md](../apps/cms-umbraco/uSync-testinnhold/README.md).
