# Modules-to-test checklist

Single source of truth for "I just changed module rendering — did anything break?" Pairs with `tests/frontend/module-visual-regression.spec.ts` (visual regression) and your eyeballs (everything Playwright misses).

## One-time setup

In your **local** Umbraco backoffice, create an article that contains every module type. Once created, the visual-regression test will lock in a baseline screenshot per module.

1. Log in: `http://localhost:5000/umbraco`, `admin@ki.norge.no` / `KiNorge2025!`
2. Right-click **Artikler** → Create → **Artikkel**
3. Name: `Module test`
4. Tab **Innhold**:
   - **Tittel**: `Module test`
   - **Slug**: `module-test`
   - **Ingress**: `Test-artikkel som inneholder én av hver artikkelmodul. Brukes til visual regression-testing.`
   - **Hovedbilde**: pick any from the Media library (or skip)
   - **Bakgrunn**: `Hvit`
5. **Innhold** block list — add these in order:
   1. **Brødtekst** (artikkelTekst): `<h2>Tekst med headinger</h2><p>Lorem ipsum dolor sit amet. <a href="https://example.com">Ekstern lenke</a> for å teste link-styling.</p><h3>Underoverskrift</h3><ul><li>Punkt 1</li><li>Punkt 2</li></ul>`
   2. **Forfatter** (artikkelByline): Navn `Test Testesen`, Stilling `Rådgiver`, Virksomhet `Digdir`, Dato today
   3. **Innhold fra organisasjon** (artikkelInnholdFra): Virksomhet `Direktoratet for testing`, Dato today
   4. **Kontaktkort** (artikkelKontaktkort): Tittel `Kontaktperson`, Navn `Kari Test`, Stilling `Tester`, E-post `kari@test.no`, Telefon `12345678`
   5. **Prosessteg** (artikkelProsessteg): Tittel `Slik foregår det`, add 4 steps with etikett `Steg` and short body text each
   6. **Fremheving** (artikkelFremheving) — variant 1 — default: Tittel `Faktaboks`, Tekst `<p>Standard fremheving uten bakgrunn eller anførselstegn.</p>`
   7. **Fremheving** — variant 2 — bakgrunn på: Tekst `<p>Med farget bakgrunn.</p>`, toggle `Vis bakgrunn`
   8. **Fremheving** — variant 3 — sitat: Tekst `<p>Et sitat med store anførselstegn.</p>`, Kilde `Test Testesen`, toggle `Vis anførselstegn`
   9. **Fremheving** — variant 4 — med bilde: Tittel `Med illustrasjon`, Tekst `<p>Fremheving med bilde til venstre.</p>`, Bilde from media, toggle `Vis bakgrunn`
   10. **Trekkspill** (artikkelTrekkspill): Tittel `Spørsmål 1`, Innhold `<p>Svar 1.</p>`
   11. **Trekkspill**: Tittel `Spørsmål 2`, Innhold `<p>Svar 2 med <strong>fet</strong> og <em>kursiv</em>.</p>`
   12. **Bilde-seksjon** (artikkelBildeSeksjon): pick image, Bildetekst `Eksempel-bildetekst med kreditering`
6. Tab **SEO**: leave defaults
7. Click **Save and publish**

## Verify it landed

```bash
curl -s "http://localhost:5000/umbraco/delivery/api/v2/content?filter=contentType:artikkel&take=20" \
  -H "Api-Key: a6f9karMzjTEhSCZVTbHKcRv5k9ZL4U6tAsveqak" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print([x['name'] for x in d.get('items',[]) if 'odule test' in x['name']])"
```

Expect: `['Module test']`.

Visit `http://localhost:4321/artikler/module-test` — every module should render.

## Lock in visual baseline

```bash
TARGET=local npx playwright test --config=tests/playwright.config.ts \
  tests/frontend/module-visual-regression --update-snapshots
```

Commits the baseline screenshots to `tests/frontend/module-visual-regression.spec.ts-snapshots/`. From now on, any change that visually alters a module will fail the test until you re-baseline.

## When you change a module intentionally

```bash
TARGET=local npx playwright test --config=tests/playwright.config.ts \
  tests/frontend/module-visual-regression
```

If it fails: inspect the diff (Playwright outputs to `test-results/`). If the change is intended, run with `--update-snapshots` to refresh.

## What this DOESN'T cover

- The CMS editor experience for adding blocks (use `tests/cms/artikkel-crud.spec.ts` for shallow coverage; comprehensive editor flow tests are deferred)
- Mobile/responsive rendering (current tests run desktop only)
- Modules used in `eksempler/[slug]` or `sandkasse/index` (same renderer, but page-level layout differs)
- Legacy modules used in old prod content but not in our new templates (`artikkelInfoBoks`, `artikkelCallout`, `artikkelSitat`, `artikkelHero`) — they still render via the renderer's fallback paths, but no baseline screenshot exists. Add to the test article if you care.

## Maintenance

When a new module is added to the artikkel block list:
1. Add a block of it to the Module test article (manually)
2. Add an entry to the `MODULES` array in the test file
3. Re-baseline with `--update-snapshots`
