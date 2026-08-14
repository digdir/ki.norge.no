# KI Norge, ruteoversikt for smoketesting

Kilde for `tests/routes.spec.ts`. Hver `### /sti`-overskrift blir en rute som
smoketesten slår opp og forventer 200 på, med mindre den står i 404-seksjonen.
Dynamiske mønstre med `[slug]` hoppes over.

Lå tidligere i `public/` og ble servert offentlig på ki.norge.no/llm.txt. Det var
utilsiktet. Er du ute etter filen som beskriver nettstedet for språkmodeller, se
`src/pages/llms.txt.ts`.

## Miljø
- Base URL (lokalt): http://localhost:4321
- CMS: Umbraco, innhold hentes via Delivery API v2 ved request

## CMS-avhengighet
Sidene henter innhold fra Umbraco. Er CMS-et nede eller innholdet upublisert,
rendres fallback-innhold. Det gjelder sandkasse, artikler, veiledning og eksempler.
Smoketesten sjekker derfor status, ikke overskrifter: titlene er redaksjonelle og
endres uten at det er en feil.

## Globalt (gjelder alle sider)
- Toppnavigasjon med lenker til /veiledning, /sandkasse, /eksempler, /artikler, /om-oss
- "Hopp til hovedinnhold" finnes (a11y-smoke)
- Footer inneholder lenker til samarbeidspartnere

## Ruter

### /
Forsiden. Hero, aktuelt, sandkasse, eksempler, veiledning.

### /veiledning
Oversikt over veiledningsløpene.

### /sandkasse
Informasjonsside om KI-sandkassen.

### /eksempler
Oversikt over dokumenterte eksempler.

### /eksempler/[slug]
Dynamisk, krever publisert eksempel i CMS.

### /artikler
Oversikt over artikler.

### /artikler/[slug]
Dynamisk, krever publisert artikkel i CMS.

### /kalender
Oversikt over kalenderhendelser.

### /om-oss
Om KI Norge, med partnerkort.

## Maskinlesbare endepunkter

### /robots.txt
Crawl-regler, Content-Signal og peker til sitemap og llms.txt.

### /sitemap.xml
Genereres fra hele det publiserte innholdstreet.

### /llms.txt
Nettstedsoversikt for språkmodeller, genereres fra CMS-et.

## 404-test
- GET /__does_not_exist__ -> 404
- GET /personvern -> 404 (ikke implementert)
- GET /tilgjengelighet -> 404 (ikke implementert)
