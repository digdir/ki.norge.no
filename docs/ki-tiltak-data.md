# ki-tiltak.json

The files are in `apps/frontend/src/data/`.

The dataset behind `/ki-tiltak`. The file is maintained manually by the editorial team. There is no longer a build script that generates it, so what you write here is what the page shows.

Note that the file is read at build time, not on every page view. Changes require a new deploy before they are visible.

## Adding an initiative

Copy an existing object, paste it in the right place in the list, and fill in the fields.

```json
{
  "id": "0b9ae3a2-8a0c-4c0e-9f4b-3c6d7e1a2b44",
  "navn": "Samtaletrening med KI",
  "virksomhet": "Barne-, ungdoms- og familiedirektoratet",
  "orgnr": "986128433",
  "fagomrade": "Familie og barn",
  "beskrivelse": "En dialogbasert treningsplattform der offentlig ansatte kan øve på krevende samtaler med KI-simulerte personer i sårbare situasjoner."
}
```

The six fields above are required. New initiatives can also have `fase`, `kiType`, `leveranse` and `kontaktinfo`, see [ki-tiltak-fields.md](ki-tiltak-fields.md). That is also where it says how to paste a new initiative straight from the email.

## The fields

| field | requirement |
|---|---|
| `id` | Unique. Create a new GUID, for example with `uuidgen` in the terminal. Never reuse an id |
| `navn` | The initiative's name, as it should be shown |
| `virksomhet` | The name as it is in the export, also in CAPITALS. The page shows the name from the name table, see below. Several organisations are written as a list, with the main organisation first |
| `orgnr` | Nine digits, as in the Brønnøysund Register Centre. A list in the same order when `virksomhet` is a list |
| `fagomrade` | Exactly one of the values in the list below |
| `beskrivelse` | Free text. Shown truncated to three lines on the card, in full in the detail view |

Several organisations:

```json
"virksomhet": ["Helse Bergen HF", "Helse Førde HF"],
"orgnr": ["983974724", "983974732"]
```

In the detail view they are shown one per line. On the card they are shown one after another with commas, cut with "…" after two lines.

A field without a value is not shown. That applies to `null`, empty text, only spaces, empty lists, and `NA`, `N/A`, `-`, `–`, `null` and "ikke oppgitt".

### Valid subject areas

Copy the value verbatim, including commas and lower case.

```
Arbeid
Demokrati og styresett
Digitale teknologier
Familie og barn
Forskning
Helse og omsorg
Informasjonssikkerhet
Innbygger
Kultur, idrett og fritid
Natur, klima og miljø
Personvern
Plan, bygg og eiendom
Trafikk og transport
Virksomhet
Økonomi, finans og forsikring
```

If you need a subject area that is not listed here, it must first be added to `FAGOMRADER` in `apps/frontend/src/lib/ki-tiltak.ts`. Tell a developer.

## Bullet lists in description and purpose

JSON has no room for formatting, so line breaks are written as `\n`. Lines
that start with a bullet become a real bullet list in the detail view.

```json
"beskrivelse": "Dette er noen eksempler:\n• Første punkt\n• Andre punkt\n• Tredje punkt"
```

That gives an introduction followed by a list. `•`, `-` and `*` all work as
markers, and the marker is removed before the text is shown.

Three things to be aware of.

**A `\n` is two characters**, backslash and n, not a real line break. If you press enter
in the middle of a text, the file becomes invalid JSON and the build stops.

**The card in the overview shows no lists.** There the first three lines are shown as
running text, since the card is only a teaser. The whole list is shown when you open
the initiative.

**Never paste straight from Word.** Invisible characters come along, often `·` or
`▪` instead of `•`. Go through a plain text editor first.

## One pitfall

**Phase and subject area are strict.** A typo such as `Gjennomføing` makes the whole page respond with an error, not just the one card. Copy the value instead of typing it.

## Check before you commit

```
cd apps/frontend && pnpm run test:unit
```

The tests check that the file is valid JSON, unique ids, valid subject areas and phases, required fields, that no removed fields are included, and the sorting. They also run in CI, so an error stops the build, but it is faster to discover it locally.

If there is a syntax error, the test `ki-tiltak.json > is valid JSON` says which line it concerns, and what is probably missing. Most often it is a comma between two initiatives, one comma too many after the last one, or a missing `{`.

## New export from the register

The whole list is replaced with one command from the root of the repo:

```bash
node apps/frontend/scripts/klargjor-ki-tiltak.mjs ~/Downloads/<export>.json
```

1. The script writes `ki-tiltak.json`. It sets "NA" and "N/A" to `null`, removes NA pieces between ";", and replaces the register's variants, such as "Språkteknologi (NLP)", with our values.
2. Read the report. It shows how many NA and variants were corrected, which overrides were applied, and what needs a hand: unknown values, org numbers without a name and initiatives without a subject area.
3. Add new org numbers to `ki-tiltak-virksomhetsnavn.json` with normal upper and lower case.
4. If something in the export is to be corrected by hand, put it in `ki-tiltak-overstyringer.json` under the initiative's id, with `sett` for whole fields or `erstatt` for a piece of text, and a `hvorfor`. Then the correction survives the next export.
5. Run `pnpm --dir apps/frontend run test:unit`.

## Organisation names

`ki-tiltak-virksomhetsnavn.json` gives each org number a display name with normal upper and lower case. A new organisation in the data means a new line there, otherwise the tests stop. `VIRKSOMHETSNAVN` in `apps/frontend/src/lib/ki-tiltak.ts` switches between `'tabell'` (default) and `'register'` (the names in the data), to be able to switch quickly. With `'tabell'`, an organisation that is not yet in the table gets a capital first letter instead of CAPITALS, until it has been added.

## Next

The plan is to move the dataset into Umbraco, so that the editorial team can edit initiatives in the CMS instead of in this file. Until that is in place, this file is the source of truth.
