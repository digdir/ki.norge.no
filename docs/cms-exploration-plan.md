# CMS Exploration Plan

Two branches explore alternatives to Strapi for editorial workflows.
Neither branch affects main. Both are throwaway explorations.

---

## Branch: explore/umbraco-migration

Goal: Determine if Umbraco can replace Strapi as a headless CMS
while keeping the existing Astro + Designsystemet frontend intact.

### Step 1: Local Umbraco instance

Set up Umbraco via Docker with SQL Server.
PostgreSQL cannot be reused — Umbraco requires SQL Server or SQLite.
Get the admin panel running and accessible at localhost.

### Step 2: Recreate content types

Map all six Strapi content types to Umbraco document types:

Artikkel: tittel, slug, innhold
Veiledning: tittel, slug, innhold, kategori, lenker, rekkefølge
Eksempel: tittel, slug, organisasjon, beskrivelse, verktøy, resultater, status, bilde, merkelapper
FAQ: spørsmål, svar, kategori, rekkefølge
Side: tittel, slug, innhold, template, seoTittel, seoBeskrivelse
Merkelapp: navn, slug, beskrivelse

### Step 3: Enable Content Delivery API

Configure Umbraco's Content Delivery API (opt-in, not default).
Verify all six content types are accessible via REST.
Document the response format differences from Strapi.

### Step 4: Seed test content

Enter the same test content that Strapi seeds automatically.
Three articles, two examples, one guide, three FAQs, three tags, one page.

### Step 5: Rewrite frontend API layer

Replace apps/frontend/src/lib/strapi.ts with an Umbraco client.
Map Umbraco's response format to the TypeScript interfaces the frontend expects.
The rest of the frontend should not change.

### Step 6: Rewrite BlocksRenderer

Umbraco returns rich text as HTML strings, not structured JSON blocks.
Two options to evaluate:
a) Render HTML directly (loses DS component integration inside rich text)
b) Parse HTML into AST and map to DS components (maintains DS but adds complexity)

Implement option (a) first to get things working, then try (b).

### Step 7: Verify

Run the site end-to-end: Umbraco → Astro → browser.
Run existing Playwright tests — all route, functional, and accessibility tests should pass.
Visual tests will likely need new baselines.

### Step 8: Document editorial workflow gains

Test and document what Umbraco provides out of the box:
scheduled publishing, content versioning, rollback, user roles.
Note what requires Umbraco paid edition vs Community.

### Known risks

Umbraco requires .NET runtime — a second runtime alongside Node.
The Content Delivery API is a secondary citizen in the Umbraco ecosystem.
Rich text as HTML strings means less granular control over DS component rendering.
No existing migration tooling between Strapi and Umbraco.
Team has no .NET/C# experience.

---

## Branch: explore/decap-cms

Goal: Determine if Decap CMS (formerly Netlify CMS) can replace Strapi
using a Git-based editorial workflow with no database.

### Step 1: Add Decap to the frontend

Decap is a single-page React app served from a static route.
Add it at /admin in the Astro frontend.
Configure it to read/write content as markdown or JSON files in the repo.

### Step 2: Define collections

Map the six content types to Decap collections.
Each collection defines fields that mirror the Strapi schemas.
Content files live in a content/ directory in the repo.

### Step 3: Configure editorial workflow

Enable Decap's editorial workflow mode.
This creates draft content as Git branches and publishes via merge.
Test with multiple users if possible.

### Step 4: Rewrite frontend data layer

Replace Strapi API calls with local file reads.
Astro can read markdown/JSON at build time natively — this simplifies the stack.
No API server needed at all.

### Step 5: Evaluate rich text

Decap uses markdown for rich text.
Evaluate whether markdown rendering can integrate with DS components
or if it's limited to basic HTML output.

### Step 6: Evaluate limitations

Test relational content: can tags be linked to articles?
Decap supports relation widgets but they're file-path based, not database joins.
Document what works and what doesn't.

### Step 7: Document findings

Write up the editor experience, limitations, and whether it fits
multi-agency editing with approval workflows.

### Known risks

No relational content model — tags/categories are flat references.
Git-based workflow may confuse non-technical editors.
No server-side preview of draft content without a build.
Permissions depend on Git hosting provider (GitHub teams, etc.).
No structured block editor — markdown only.
Conflict resolution is abstracted but still Git under the hood.

---

## Evaluation criteria

After both branches are complete, compare on:

1. Editor experience for non-technical users from multiple agencies
2. Approval/review workflow before publishing
3. Scheduled publishing and content versioning
4. Rich text rendering quality with Designsystemet
5. Ongoing maintenance burden and ecosystem support
6. Infrastructure requirements and deployment complexity
7. Team skill alignment (TypeScript/Node vs .NET vs Git)
