# How to release new versions (deploy)

A recipe for releasing new versions after code has changed.

- [Frontend (ki-norge-frontend)](#frontend-ki-norge-frontend)
- [Umbraco CMS](#umbraco-cms)
- [Cache worker (cache-kinorgeportal)](#cache-worker-cache-kinorgeportal)
- [CMS worker (cms-kinorgeportal)](#cms-worker-cms-kinorgeportal)
- [Order when several parts change](#order-when-several-parts-change)

Everything is deployed from `main`. The frontend scripts (`deploy:check-main`) stop when the working tree is not clean. If it is clean, they switch to `main` and stop if `main` is not in sync with origin. In a git worktree where `main` is checked out somewhere else, the switch fails, and the deploy stops.

## Frontend (ki-norge-frontend)

After changes to the page engine, new versions are released from the command line locally.

1. Check that the changes are merged to `main` in GitHub.
2. Pull the latest changes locally.
3. Deploy:

```bash
pnpm run frontend:deploy:tt02
pnpm run frontend:deploy:prod
```

The script builds, deploys and purges the Cloudflare cache for the environment. You do not need to purge manually.

If you are not logged in to the Digitaliseringsdirektoratet Cloudflare account, you will be asked to.

Deploy to tt02 first when the change is visible to users. Both environments are open, so a fault in prod is a fault the public sees.

### Verifying that the right version is running

The deploy output gives a `Version ID`, but it only says the upload went well. If you want to know that the change is actually out, look for a marker you know is new, with a cache buster:

```bash
curl -s "https://ki.norge.no/artikler?cb=$RANDOM" | grep -o "something-you-know-is-new"
```

A cache buster is mandatory behind Cloudflare. Without it you may measure a cached copy of the previous version.

## Umbraco CMS

Changes to Umbraco require two steps: building an image, and rolling it out. A green build does not mean anything has been rolled out.

### 1. Build a new image

1. Check that the changes are merged to `main`.
2. Find the previous version number on [Publish Syncroot artifacts](https://github.com/digdir/ki.norge.no/actions/workflows/publish-syncroot-main.yaml).
3. Run [Docker build and publish](https://github.com/digdir/ki.norge.no/actions/workflows/docker-publish.yaml) with the next number and a keyword, for example `63-adressefelt`.

The image is uploaded to ghcr.io.

If the job fails, read the output before doing anything else. Not every failure is yours: the cosign install fetches from GitHub's release CDN, and a 504 from there stops the build without anything being wrong with the code. Then it is enough to run it again.

### 2. Roll out

1. Run [Publish Syncroot artifacts](https://github.com/digdir/ki.norge.no/actions/workflows/publish-syncroot-main.yaml).
2. Choose the environment and enter the version number from step 1.

The workflow always points the pod at Azure SQL. There is no database choice.

The workflow looks up the digest the tag points to, and pins the pod to it. If the tag does not exist, it stops. Rollback is the same with the previous tag.

The workflow publishes an artifact. Flux picks it up on a five-minute interval, so it takes a few minutes before the pod is actually rolled. **A green workflow does not prove that the rollout has happened.**

### 3. Verify

With VPN:

```bash
kubectl get pods -n product-kinorgeportal
```

Without VPN the most direct measurement is to ask the Delivery API for something you know is new. Let a schema change be its own proof:

```bash
curl -s "https://cms.ki.norge.no/umbraco/delivery/api/v2/content?take=200&expand=properties%5B%24all%5D" \
  | grep -c "your-new-field"
```

If it goes from 0 to a number, both the rollout and the uSync import are done. In the middle of the rollout the API responds empty for a moment, that is normal.

The backoffice hash is **not** good enough to see whether the pod rolled. It only reflects the Umbraco version. If you want to measure the image without VPN, use `Last-Modified` on a file under `App_Plugins`. That is the build time of the image.

### 4. Check that the content is intact

After a schema change: count blocks, content types and "Unsupported" in the Delivery API before and after. If the numbers are the same, nothing was re-keyed. If the number of "Unsupported" is above zero, stop and look at the uSync keys before doing anything more.

### Everything in one command: `scripts/deploy-cms.sh`

```bash
bash scripts/deploy-cms.sh tt02 [tag]
bash scripts/deploy-cms.sh prod [tag]
```

The script does steps 1 to 3 above. It starts "Docker build and publish" and "Publish Syncroot artifacts" with `gh workflow run`, waits until the pod runs the new image, and checks the health.

- **The tag must be an integer** (`^[0-9]+$`). Without a tag the script takes the highest number after "Deploy" in the titles of the latest runs of "Publish Syncroot artifacts", and adds 1. Tags with keywords, like `63-adressefelt`, are not accepted. The script and the recipe above therefore produce tags in different forms.
- Requires `gh` with permission to start the workflows, a clean working tree and `HEAD` equal to `origin/main`. The script does not switch branch itself.
- Always chooses AzureSQL. For prod you must type `prod` to continue.
- With the Altinn VPN it waits up to about 15 minutes for the pod to run `umbraco:<tag>@sha256:…` and be ready. Without VPN it cannot confirm that the new image is running, and the health check only says that something responds.
- The health check waits for 200 from the frontend and a response with `total` from the Delivery API. With VPN it also reads the log, and stops if the uSync import changed the schema. After an intended schema change that is exactly what happens, so then you have to read the log yourself.

## Cache worker (cache-kinorgeportal)

After changes to what is cached:

```bash
pnpm run cache-kinorgeportal:deploy:tt02
pnpm run cache-kinorgeportal:deploy:prod
```

Manually remove pages that should no longer be cached from Cloudflare afterwards.

Avoid purging the whole cache for ki.norge.no during the day.

## CMS worker (cms-kinorgeportal)

After changes to the entry gateway to the editor interface:

```bash
pnpm run cms-kinorgeportal:deploy:tt02
pnpm run cms-kinorgeportal:deploy:prod
```

Test that login to `https://cms.ki.norge.no/umbraco` works afterwards.

At the same time, check that images still load on the front page. The workers.dev hostnames carry prod media, and `workers_dev` must be `true` for this worker. When it was turned off, the images dropped out for ten minutes.

## Order when several parts change

If you change both schema and frontend in the same round, do the CMS first. A frontend that reads a field that does not exist yet shows empty. A CMS that has a field nobody reads shows nothing wrong.

1. Build and roll out the CMS image to tt02, verify
2. Same to prod, verify
3. Frontend to tt02, then prod

## Common errors

**Login to the backoffice loops after deploy.** The server is usually healthy. Try a private window first, and clear localStorage.

**The page is unstyled after deploy.** Edge-cached HTML points to an `_astro` hash that has been deleted. The right fix is a purge, which the deploy script does itself.

**A field added in `ContentTypeComposer` does not show up in prod.** It should not. The composer is turned off in production. See [System documentation](system-documentation.md#schema-and-usync).
