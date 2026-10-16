# Claude Code — ki.norge.no

Portal for kunstig intelligens i norsk offentlig sektor. Drives av Digitaliseringsdirektoratet.

All dokumentasjon ligger i `docs/`. `docs/llms.txt` indekserer alt, og `docs/utvikling.md` har kodekartet, nøkkelfilene og lenkene. Denne fila har reglene.

## Kjøre lokalt

```bash
# Frontend (Astro SSR, Cloudflare-adapteren også lokalt)
pnpm run frontend:dev         # http://localhost:4321

# CMS (Umbraco .NET 10)
pnpm run cms:dev              # http://localhost:5000/umbraco
                              # admin@ki.norge.no / KiNorge2025!

# Frontend mot prod-CMS (trenger ikke lokal CMS, kjører på Node-adapteren)
pnpm run frontend:dev:prod
```

Første gang CMS kjøres opprettes SQLite-databasen og admin-brukeren automatisk (unattended install). Innhold seedes ikke, se «Innholdsskriving fra kode» under.

Innlogget bruker over er en lokal kastebruker mot din egen SQLite-fil. Den gir
ikke tilgang til noe delt, og passordet er derfor ikke en hemmelighet. Ikke
gjenbruk verdien, eller mønsteret, noe sted den er ekte. Ekte verdier ligger i
Azure Key Vault per miljø, og er dokumentert i Confluence.

## Arkitektur

Monorepo med to hovedapper, frontend på Cloudflare Workers og CMS på Altinn dis-core (Kubernetes), og to små workere foran dem.

```
apps/frontend/          Astro SSR, Cloudflare Workers, designsystemet-react
apps/cms-umbraco/       Umbraco 17, .NET 10, Azure SQL (prod), SQLite (lokalt)
apps/cache-kinorgeportal/  Cache-worker foran ki.norge.no
apps/cms-kinorgeportal/    Proxy-worker foran cms.ki.norge.no
```

Frontend henter innhold via Umbraco Delivery API v2. Miljøer, workere og drift står i `docs/systemdokumentasjon.md`.

## Frontend

- Søk er en modal (`SearchDialog`, kaller `/api/search`), ikke en egen side. Det finnes IKKE en `/kontakt`-, `/faq`-, `/sok`- eller `/ki-ordbok`-side i koden. Footer har en "Kontakt oss"-seksjon, men ingen kontaktside.
- `src/components/shared/ArticleBlocksRenderer.astro` er **eneste** sted artikkelmoduler rendres. Endre denne én filen → alle sidene oppdateres.
- **Designsystem:** Bruk designsystemet-tokens (--ds-size-4, --ds-color-text-default osv.) der de finnes. Ingen Tailwind.

## CMS (Umbraco)

**Skjemaendringer nås IKKE lenger via composeren i drift.** Både `syncroot/prod/` og
`syncroot/tt02/` setter `USYNC_OWNS_SCHEMA=true`, og `ContentTypeComposer` hopper da over
hele skjema-assertingen (`ContentTypeComposer.cs:116`). Den kjører fortsatt lokalt, der
env-varen mangler. Et nytt felt lagt til i composeren blir altså grønt lokalt og i CI, og
dukker aldri opp i prod. Skjemaet i drift kommer fra `.config`-filene under
`apps/cms-umbraco/uSync/`, som skal eksporteres fra prod. **Spør Lars før du planlegger en
skjemaendring** — flyten er under omlegging (stage 2 fjerner composeren). Ny Block List-modul: se `docs/utvikling.md`.

**Connection string (lokal SQLite):** Må bruke `|DataDirectory|` i path, ikke relativ sti. Ellers finner ikke Umbraco databasen. Prod kjører Azure SQL via dis-core (connection string injiseres fra Key Vault, ikke SQLite).

**Innholdsskriving fra kode = anti-pattern**: Skjema (content types) ble satt i kode via `ContentTypeComposer` (nå avslått i drift, se over), men content NODES skal ALDRI skrives fra oppstartskode. Det har gitt 3 prod-incidenter (Sandkasse, nesten Caser, og veiledningsduplikat fra dev-seederen). `ContentSeeder` er derfor fjernet helt; demo/test-innhold lages via editor. Se beslutningsloggen, `docs/rapporter/beslutningslogg.md`.

**uSync eier skjemaet i prod. IKKE regenerer `apps/cms-umbraco/uSync/`**: filene der er prod sitt skjema og importeres ved hver oppstart. uSync re-nøkler ved import, og content-typene har tilfeldige GUID-er per database. En eksport tatt fra lokal maskin eller tt02, committet inn, gir prod-typene nye nøkler og gjør ALT blokkinnhold «Unsupported». Skal du eksportere eller committe noe der: **stopp og spør Lars først**, og si fra om konsekvensen. Eksporten skal alltid tas fra prod. `SchemaRekeyGuard` avbryter en import som ville re-nøklet, men den er en sikring, ikke en tillatelse. Se `apps/cms-umbraco/uSync/README.md`.

## Deploy

- **CMS:** dis-core via GitHub Actions («Docker build and publish» + «Publish Syncroot artifacts», miljø tt02/prod).
- **Frontend:** Cloudflare Workers via `pnpm run frontend:deploy:prod` (og `:tt02`).

Alt deployes fra `main`. Frontend-skriptene stopper når arbeidstreet ikke er rent, bytter ellers til `main`, og stopper hvis `main` ikke er i takt med origin. Oppskriften står i `docs/deploy.md`.

## Viktige beslutninger

- Media ligger i Azure Blob (`AzureBlobMediaComposer.cs`). `umbraco-media` er bevisst ikke montert på `/app/wwwroot/media`, se `syncroot/base/umbraco/deployment.yaml`
- Ingen dark mode (bevisst valg)
- Ingen Tailwind
- Admin-tilgang via skjemaet på `/admin-tilgang` (eller `?key=<ADMIN_SECRET>`) setter ki_admin cookie, som utløper på serveren etter 30 dager
- Kommer-snart-modus gjelder `GATED_HOSTS` med mindre `LAUNCH_MODE=live` (per miljø i `wrangler.jsonc`)

## Dokumentasjon

**Hvor.** All dokumentasjon ligger i `docs/`. Inngangen for mennesker er `docs/README.md`, og indeksen for agenter er `docs/llms.txt`. Beslutningsloggen og rapportene ligger i `docs/rapporter/`.

**Hva som skal i docs.** Det som ikke går fram av koden:

- hvordan ting henger sammen i drift
- miljøer, deploy og rutiner
- hvilke tilganger som trengs, med navn og aldri verdier
- konfig som slår ting av og på
- feller som har kostet tid

Beslutninger føres kort i `docs/rapporter/beslutningslogg.md`. Større valg får et eget dokument.

**Hva som ikke skal i docs.** Det koden selv sier tydelig. Planer for framtiden, som hører hjemme i issues. Personnavn utenom roller. Hemmelige verdier, og ID-er som ingen trenger.

**Når det oppdateres.**

- I samme PR som endringen dokumentet beskriver.
- En PR som endrer drift, deploy, konfig, skjemaflyt eller tilganger, oppdaterer docs i samme PR.
- `docs/llms.txt` og `docs/README.md` oppdateres når et dokument legges til, flyttes eller slettes.
- Hver tredje måned, og ved hver overlevering, går noen gjennom docs og retter eller sletter det som er utdatert. Historikken ligger i git.

**Dokumentasjon i ettertid.** En agent kan dokumentere et valg som allerede er gjort, når det mangler dokumentasjon av noe som vanligvis burde vært dokumentert. Da skal det stå at teksten er skrevet i ettertid, med dato og kilde (PR, commit eller issue). Er kilden uklar, står det at det er en tolkning.

## Stilpreferanser (kommentarer, issues, commit-meldinger)

- Norsk bokmål
- Ingen emojier
- Ikke bruk em dash
- Minimalt med kolon
- Konsist, sjekkliste-format

## Teamet

- Sara: redaktør, innholdsansvarlig
- Eira: designer
- Benjamin: KI-søk API
- Pooria: utvikler
- Marie: prosjektleder
- Kenneth Helland: norge.no domeneansvarlig
- drift@digdir.no: DNS-endringer
