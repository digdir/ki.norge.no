# Fields in ki-tiltak.json

Reference for whoever enters initiatives in `apps/frontend/src/data/ki-tiltak.json`.

## The simplest way: paste from the email

The email that arrives at `ki-tiltak@kin.norge.no` has a block at the bottom called **TIL KI-TILTAK.JSON**. It is the whole entry, with a new id, the right field names and the values as the form has them. Copy the block as it is, and paste it on the line right after `[` at the top of the file. The trailing comma is included.

Then you do not need to write anything by hand. The only things that may need cleaning are `virksomhet`, which is the name the submitter wrote, and `beskrivelse`, if you want to copy-edit it.

## The whole model

```json
{
  "id": "bda57bb4-992e-4b12-adb5-1fddaa34f8b4",
  "navn": "#DataSaman",
  "virksomhet": "Entur AS",
  "orgnr": "917422575",
  "fagomrade": "Trafikk og transport",
  "beskrivelse": "Entur jobbar systematisk for å teste og utnytte moglegheitene som følgjer av forbetringar innan KI.",
  "fase": "Gjennomføring",

  "kiType": ["Generativ KI", "Språkteknologi"],
  "kiTypeAnnet": "",
  "leveranse": ["Pilot"],
  "leveranseAnnet": "",
  "kontaktinfo": "post@entur.no"
}
```

The top six are required and exist on all entries. The bottom six are optional and apply only to new initiatives.

## The new fields

| Field | Type | Valid values |
| --- | --- | --- |
| `fase` | text | `Innsikt og planlegging`, `Gjennomføring`, `I drift`. Shown as **Fase** |
| `kiType` | list | `Generativ KI`, `Prediktiv KI`, `Agentisk KI`, `Språkteknologi`, `Computer Vision`, `Anbefalingssystemer`, `Annet` |
| `kiTypeAnnet` | text | Free text. Only when `kiType` contains `Annet` |
| `leveranse` | list | `PoC`, `MVP`, `Pilot`, `Løsning i produksjon`, `Annet` |
| `leveranseAnnet` | text | Free text. Only when `leveranse` contains `Annet` |
| `kontaktinfo` | text | Email address |

**There is no status field.** It was removed because the category is not to be used. `fase` is the answer to the form's "Hvilken fase er tiltaket i?", and is shown as **Fase**.

**The form gives one delivery choice.** "Hva skal tiltaket levere?" is radio buttons, so a new submission always has one value in `leveranse`. The field is still a list in the model, since older initiatives may have several. The email to the editorial team writes it as a list with one element.

**Lists, not sentences.** `kiType` and `leveranse` are lists with the words from the table, spelled the same. Write `["MVP", "Pilot"]`, not `"MVP og pilot."`. The page shows them as plain text, for example "MVP, Pilot og Løsning i produksjon".

## Several organisations

`virksomhet` and `orgnr` can be lists in the same order, with the main organisation first:

```json
"virksomhet": ["Helse Bergen HF", "Helse Førde HF"],
"orgnr": ["983974724", "983974732"]
```

In the detail view they are shown one per line. On the card they are shown one after another with commas, cut with "…" after two lines. Search covers all of them.

If the form has several organisations, the email block **TIL KI-TILTAK.JSON** writes `virksomhet` and `orgnr` as lists, with the responsible organisation first and the partner organisations after.

## New export from the register

The whole list is replaced with one command from the root of the repo:

```bash
node apps/frontend/scripts/klargjor-ki-tiltak.mjs ~/Downloads/<export>.json
```

1. The script writes `apps/frontend/src/data/ki-tiltak.json`. It sets "NA" and "N/A" to `null`, removes NA pieces between ";", and replaces the register's variants, such as "Språkteknologi (NLP)", with our values.
2. Read the report. It shows how many NA and variants were corrected, which overrides were applied, and what needs a hand: unknown values, org numbers without a name and initiatives without a subject area.
3. Add new org numbers to `apps/frontend/src/data/ki-tiltak-virksomhetsnavn.json` with normal upper and lower case.
4. If something in the export is to be corrected by hand, put it in `apps/frontend/src/data/ki-tiltak-overstyringer.json` under the initiative's id, with `sett` for whole fields or `erstatt` for a piece of text, and a `hvorfor`. Then the correction survives the next export.
5. Run `pnpm --dir apps/frontend run test:unit`.

## Organisation names

`virksomhet` is as in the export, often in CAPITALS from the Brønnøysund Register Centre. The page instead shows the name from `apps/frontend/src/data/ki-tiltak-virksomhetsnavn.json`, which looks up on `orgnr`. If a new organisation comes along, add a line there with the org number and the name in normal upper and lower case. The tests stop if an org number is missing.

`VIRKSOMHETSNAVN` in `apps/frontend/src/lib/ki-tiltak.ts` switches between `'tabell'` (default) and `'register'` (the names as they are in the data). It exists to be able to switch quickly. With `'tabell'`, an organisation that is not yet in the table gets a capital first letter and otherwise lower case, with known abbreviations such as HF and AS kept. That is wrong for place names, and that is why the table is the first choice.

## Rules worth knowing

**Optional really means optional.** Leave the field out, leave it empty, or set it to `null`, it makes no difference. `NA`, `N/A`, `-`, `–`, `null` and "ikke oppgitt" also count as empty, regardless of upper and lower case, and so does a list with only such values. An empty field is not shown at all, not even the heading. An initiative with only a description and a theme should look finished, not half filled in.

**Do not backfill the old ones.** The new fields apply only to initiatives submitted or updated via the form on /ki-tiltak. Nobody should guess which AI type an organisation uses.

**"Annet" is replaced by the free text.** If you write `"leveranse": ["Pilot", "Annet"]` and `"leveranseAnnet": "Intern verktøykasse"`, the page shows "Pilot" and "Intern verktøykasse". The word "Annet" is not shown. If the free text is there without `Annet` being in the list, the text is never shown, and a test stops it.

**The contact address is published.** Both on the site and in the git history of a public repo. A functional address such as `post@` is preferable, but the work address the submitter gave is fine.

**Each entry needs a unique id.** Two initiatives with an empty id get the same link, and then both open the first one. The block in the email has a new id. If you write by hand, generate one at [uuidgenerator.net](https://www.uuidgenerator.net/).

## Links in the description

Written as markdown: `[Se rapporten](https://example.no/rapport)`.

Only links. Not bold, not images, not HTML. And only `http` and `https`. Anything else is shown as visible text on the page, which looks like an error, so a test catches it first.

Line breaks are written as `\n`. Lines that start with `-`, `•` or `1.` become bullet lists when displayed.

## Punctuation

End the description with a full stop. 52 of the 58 existing ones already do. This is not enforced by code, on purpose: a description that ends with an abbreviation or a URL would be made wrong by an automatic rule.

## What the tests catch

`pnpm --dir apps/frontend run test:unit` runs in CI on every PR and stops:

- syntax errors, such as a missing comma or a missing `{`. The error message says which line, shows the surrounding lines and explains what is usually wrong. In a PR it is also shown as an annotation on the line in the file
- fields that have been removed: `status`, and `formaal`, `oppstart` and `slutt` from an older guide
- unknown value in `kiType` or `leveranse`, meaning typos
- duplicates or empty strings in the two lists
- `Annet` free text without `Annet` being selected
- `kontaktinfo` that does not look like an email address
- a link in the description that is not `http` or `https`
- unknown phase or subject area, and duplicate ids
- org numbers missing a name in `ki-tiltak-virksomhetsnavn.json`

The error message names the initiative, for example `unknown KI type on #DataSaman`.

New fields are not stopped. They are shown only once the code starts using them.
