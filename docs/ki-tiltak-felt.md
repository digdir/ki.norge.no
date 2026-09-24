# Felt i ki-tiltak.json

Referanse for den som fører inn tiltak i `apps/frontend/src/data/ki-tiltak.json`.

## Den enkleste veien: lim inn fra e-posten

E-posten som kommer til `ki-tiltak@kin.norge.no` har nederst en blokk som heter **TIL KI-TILTAK.JSON**. Den er hele oppføringen, med ny id, riktige feltnavn og verdiene slik skjemaet har dem. Kopier blokken som den står, og lim den inn på linja rett etter `[` øverst i fila. Komma til slutt er med.

Da trenger du ikke skrive noe for hånd. Det eneste som kan trenge vask er `virksomhet`, som er navnet innsenderen skrev, og `beskrivelse`, hvis dere vil språkvaske.

## Hele modellen

```json
{
  "id": "bda57bb4-992e-4b12-adb5-1fddaa34f8b4",
  "navn": "#DataSaman",
  "virksomhet": "Entur AS",
  "orgnr": "917422575",
  "fagomrade": "Trafikk og transport",
  "beskrivelse": "Entur jobbar systematisk for å teste og utnytte moglegheitene som følgjer av forbetringar innan KI.",
  "status": "",
  "fase": "Gjennomføring",

  "kiType": ["Generativ KI", "Språkteknologi"],
  "kiTypeAnnet": "",
  "leveranse": ["Pilot"],
  "leveranseAnnet": "",
  "kontaktinfo": "post@entur.no"
}
```

De seks øverste og `status` finnes på alle oppføringene. `status` er tom på nye tiltak. De seks nederste er nye og valgfrie.

## De nye feltene

| Felt | Type | Gyldige verdier |
| --- | --- | --- |
| `fase` | tekst | `Innsikt og planlegging`, `Gjennomføring`, `I drift`. Vises som **Fase** |
| `kiType` | liste | `Generativ KI`, `Prediktiv KI`, `Agentisk KI`, `Språkteknologi`, `Computer Vision`, `Anbefalingssystemer`, `Annet` |
| `kiTypeAnnet` | tekst | Fritekst. Bare når `kiType` inneholder `Annet` |
| `leveranse` | liste | `PoC`, `MVP`, `Pilot`, `Løsning i produksjon`, `Annet` |
| `leveranseAnnet` | tekst | Fritekst. Bare når `leveranse` inneholder `Annet` |
| `kontaktinfo` | tekst | E-postadresse |

**Status og fase er ikke det samme.** `status` er de eldre oppføringenes egne verdier, `Planlagt`, `Pågående` og `Avsluttet`. Den beholdes i fila, men vises ikke og søkes ikke i, fordi kategorien ikke skal brukes lenger. La den stå tom på nye tiltak. `fase` er svaret på skjemaets «Hvilken fase er tiltaket i?», og vises som **Fase**.

**Lister, ikke setninger.** `kiType` og `leveranse` er lister med ordene fra tabellen, stavet likt. Skriv `["MVP", "Pilot"]`, ikke `"MVP og pilot."`. Sida viser dem som vanlig tekst, for eksempel «MVP, Pilot og Løsning i produksjon».

## Regler som er verdt å kjenne

**Valgfritt betyr virkelig valgfritt.** Utelat feltet, eller la det stå tomt, det gjør ingen forskjell. Et tomt felt vises ikke i det hele tatt, heller ikke overskriften. Et tiltak med bare beskrivelse og tema skal se ferdig ut, ikke halvt utfylt.

**Ikke etterfyll de gamle.** De nye feltene gjelder bare tiltak som er sendt inn eller oppdatert via skjemaet på /ki-tiltak. Ingen skal gjette seg til hvilken KI-type en virksomhet bruker.

**«Annet» erstattes av friteksten.** Skriver du `"leveranse": ["Pilot", "Annet"]` og `"leveranseAnnet": "Intern verktøykasse"`, viser sida «Pilot» og «Intern verktøykasse». Ordet «Annet» vises ikke. Står friteksten uten at `Annet` er i lista, blir teksten aldri vist, og en test stopper det.

**Kontaktadressen blir publisert.** Både på nettstedet og i git-historikken til et offentlig repo. En funksjonsadresse som `post@` er å foretrekke, men jobbadressen innsenderen selv har oppgitt er greit.

**Hver oppføring trenger en unik id.** To tiltak med tom id får samme lenke, og da åpner begge det første. Blokken i e-posten har en ny id. Skriver du for hånd, lag en på [uuidgenerator.net](https://www.uuidgenerator.net/).

## Lenker i beskrivelsen

Skrives som markdown: `[Se rapporten](https://example.no/rapport)`.

Bare lenker. Ikke fet skrift, ikke bilder, ikke HTML. Og bare `http` og `https`. Alt annet står som synlig tekst på sida, som ser ut som en feil, så en test fanger det først.

Linjeskift skrives som `\n`. Linjer som starter med `-`, `•` eller `1.` blir punktlister ved visning.

## Tegnsetting

Avslutt beskrivelsen med punktum. 52 av de 58 eksisterende gjør det allerede. Dette håndheves ikke av kode, med vilje: en beskrivelse som slutter med en forkortelse eller en URL ville blitt feil av en automatisk regel.

## Hva testene fanger

`pnpm --dir apps/frontend run test:unit` kjører i CI på hver PR og stopper:

- ukjent verdi i `kiType` eller `leveranse`, altså skrivefeil
- duplikater eller tomme strenger i de to listene
- `Annet`-fritekst uten at `Annet` er valgt
- `kontaktinfo` som ikke ser ut som en e-postadresse
- lenke i beskrivelsen som ikke er `http` eller `https`
- ukjent fase, fagområde eller status, og duplikate id-er
- virksomhetsnavn med bare versaler, som `KF`. Skriv `Kommuneforlaget (KF)`

Feilmeldingen navngir tiltaket, for eksempel `ukjent KI-type på #DataSaman`.
