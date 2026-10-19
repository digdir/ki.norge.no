# Test fixtures for tt02

Articles that push the schema, stored as uSync Content files and loaded into tt02 on command.

## Why they are in git

tt02 had such fixtures before, created directly in the backoffice. They lost their block content when
the schema was re-keyed on 5 August, nobody noticed, and on 13 August they were swept away together with
the rest of tt02's own content because they looked like clutter.

Loose content nodes in a shared environment have nobody looking after them. Here they are under version
control, they show up in the diff when someone changes a content type, and a cleanup cannot take
them by accident.

## Usage

```bash
scripts/last-testfixturer-tt02.sh          # load the fixtures
scripts/last-testfixturer-tt02.sh --sjekk  # show what would be copied
```

The script copies the `.config` files into the tt02 pod's uSync folder. Import is done in the backoffice
(Settings, uSync, Import) with the set `Speiling`. Never Clean.

The fixtures get the parent `cadd506a-4470-4f3d-9a66-3a4369bdc238` (Artikler) and show up in
the article list on tt02. Their keys all start with `7e57f1c0`, so they are easy to recognise and
cannot collide with real content.

They are on the frontend under `/artikler/<slug>`, for example
`https://ki.test.norge.no/artikler/testfixtur-alle-moduler/`. The Delivery API reports
the root (`/testfixtur-alle-moduler/`), but that route does not exist in Astro.

Verified 2026-08-13: all 8 block types render, none drop out, and the Delivery API is
healthy on `take=100` after the fixtures were in.

Prod cannot import content anyway (the `Default` set is export-only), and the script refuses
to run against a prod context.

## The fixtures

| File | What it tests |
|---|---|
| `testfixtur-alle-moduler.config` | Each of the 8 block types `artikkel.innhold` allows, in one article. Regression guard against a module falling to Unsupported. |
| `testfixtur-minimal.config` | Only required fields. Catches rendering that assumes optional fields exist. |
| `testfixtur-fiendtlig-innhold.config` | Extremely long title, emoji and combining characters, RTL, zero-width characters, raw HTML pasted from Word/Teams, script and iframe tags, table without thead, three levels of nested list, empty paragraphs, invalid email, empty optional fields in blocks. |

All three are safe to load. If you create a fixture with broken references, meaning media pointers
or links to keys that do not exist, remember that one broken property inside a Block List can
bring down the whole Delivery API response with HTTP 500, not just the one node. That happened on 13 August
when a dropdown held a raw string instead of JSON, and gave 500 on all queries with `take>=50`.

## Adding a fixture

The files were generated once and are now edited by hand. The format is uSync's Content format:
XML with property values in CDATA, where Block List values are JSON with `contentData`,
`settingsData`, `expose` and `layout`. Copy an existing fixture and change the keys.

All keys in a new fixture must be unique. Stick to the pattern `7e57f1c0-NNNN-4000-8000-…`
so they are still recognisable.
