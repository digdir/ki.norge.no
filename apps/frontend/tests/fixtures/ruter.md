# KI Norge, route overview for smoke testing

Source for `tests/routes.spec.ts`. Each `### /path` heading becomes a route that
the smoke test looks up and expects 200 on, unless it is in the 404 section.
Dynamic patterns with `[slug]` are skipped.

Used to live in `public/` and was served publicly at ki.norge.no/llm.txt. That was
unintended. If you are looking for the file that describes the site for language models, see
`src/pages/llms.txt.ts`.

## Environment
- Base URL (local): http://localhost:4321
- CMS: Umbraco, content is fetched via Delivery API v2 on request

## CMS dependency
The pages fetch content from Umbraco. If the CMS is down or the content unpublished,
fallback content is rendered. That applies to sandkasse, artikler, veiledning and eksempler.
The smoke test therefore checks status, not headings: the titles are editorial and
change without that being an error.

## Global (applies to all pages)
- Top navigation with links to /veiledning, /sandkasse, /eksempler, /artikler, /om-oss
- "Hopp til hovedinnhold" is present (a11y smoke)
- The footer contains links to partners

## Routes

### /
The front page. Hero, aktuelt, sandkasse, eksempler, veiledning.

### /veiledning
Overview of the guidance tracks.

### /sandkasse
Information page about the KI sandbox.

### /eksempler
Overview of documented examples.

### /eksempler/[slug]
Dynamic, requires a published example in the CMS.

### /artikler
Overview of articles.

### /artikler/[slug]
Dynamic, requires a published article in the CMS.

### /kalender
Overview of calendar events.

### /om-oss
About KI Norge, with partner cards.

## Machine-readable endpoints

### /robots.txt
Crawl rules, Content-Signal and pointers to the sitemap and llms.txt.

### /sitemap.xml
Generated from the whole published content tree.

### /llms.txt
Site overview for language models, generated from the CMS.

## 404 test
- GET /__does_not_exist__ -> 404
- GET /personvern -> 404 (not implemented)
- GET /tilgjengelighet -> 404 (not implemented)
