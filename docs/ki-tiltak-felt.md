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
  "fase": "Gjennomføring",

  "kiType": ["Generativ KI", "Språkteknologi"],
  "kiTypeAnnet": "",
  "leveranse": ["Pilot"],
  "leveranseAnnet": "",
  "kontaktinfo": "post@entur.no"
}
```

De seks øverste er påkrevd og finnes på alle oppføringene. De seks nederste er valgfrie og gjelder bare nye tiltak.

## De nye feltene

| Felt | Type | Gyldige verdier |
| --- | --- | --- |
| `fase` | tekst | `Innsikt og planlegging`, `Gjennomføring`, `I drift`. Vises som **Fase** |
| `kiType` | liste | `Generativ KI`, `Prediktiv KI`, `Agentisk KI`, `Språkteknologi`, `Computer Vision`, `Anbefalingssystemer`, `Annet` |
| `kiTypeAnnet` | tekst | Fritekst. Bare når `kiType` inneholder `Annet` |
| `leveranse` | liste | `PoC`, `MVP`, `Pilot`, `Løsning i produksjon`, `Annet` |
| `leveranseAnnet` | tekst | Fritekst. Bare når `leveranse` inneholder `Annet` |
| `kontaktinfo` | tekst | E-postadresse |

**Det finnes ikke noe status-felt.** Det ble fjernet fordi kategorien ikke skal brukes. `fase` er svaret på skjemaets «Hvilken fase er tiltaket i?», og vises som **Fase**.

**Skjemaet gir ett leveranse-valg.** «Hva skal tiltaket levere?» er radioknapper, så en ny innsending har alltid én verdi i `leveranse`. Feltet er likevel en liste i modellen, siden eldre tiltak kan ha flere. E-posten til redaksjonen skriver det som en liste med ett element.

**Lister, ikke setninger.** `kiType` og `leveranse` er lister med ordene fra tabellen, stavet likt. Skriv `["MVP", "Pilot"]`, ikke `"MVP og pilot."`. Sida viser dem som vanlig tekst, for eksempel «MVP, Pilot og Løsning i produksjon».

## Flere virksomheter

`virksomhet` og `orgnr` kan være lister i samme rekkefølge, med hovedvirksomheten først:

```json
"virksomhet": ["Helse Bergen HF", "Helse Førde HF"],
"orgnr": ["983974724", "983974732"]
```

I detaljvisningen står de én per linje. På kortet står de etter hverandre med komma, kuttet med «…» etter to linjer. Søket går i alle.

Har skjemaet flere virksomheter, skriver e-postblokken **TIL KI-TILTAK.JSON** `virksomhet` og `orgnr` som lister, med ansvarlig virksomhet først og samarbeidsvirksomhetene etter.

## Virksomhetsnavn

`virksomhet` står som i eksporten, ofte i VERSALER fra Brønnøysundregisteret. Sida viser i stedet navnet fra `apps/frontend/src/data/ki-tiltak-virksomhetsnavn.json`, som slår opp på `orgnr`. Kommer en ny virksomhet med, legg til en linje der med orgnr og navnet med vanlige store og små bokstaver. Testene stopper hvis et orgnr mangler.

`VIRKSOMHETSNAVN` i `apps/frontend/src/lib/ki-tiltak.ts` bytter mellom `'tabell'` (standard, med navnet i dataene som reserve) og `'register'` (navnene slik de står i dataene). Den finnes for å kunne bytte raskt.

## Regler som er verdt å kjenne

**Valgfritt betyr virkelig valgfritt.** Utelat feltet, la det stå tomt, eller sett det til `null`, det gjør ingen forskjell. `NA`, `N/A`, `-`, `–`, `null` og «ikke oppgitt» regnes også som tomt, uten hensyn til store og små bokstaver, og det samme gjør en liste med bare slike verdier. Et tomt felt vises ikke i det hele tatt, heller ikke overskriften. Et tiltak med bare beskrivelse og tema skal se ferdig ut, ikke halvt utfylt.

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

- syntaksfeil, som et manglende komma eller en manglende `{`. Feilmeldingen sier hvilken linje, viser linjene rundt og forklarer hva som pleier å være galt. I en PR vises den også som merknad på linja i fila
- felt som er fjernet: `status`, og `formaal`, `oppstart` og `slutt` fra en eldre veiledning
- ukjent verdi i `kiType` eller `leveranse`, altså skrivefeil
- duplikater eller tomme strenger i de to listene
- `Annet`-fritekst uten at `Annet` er valgt
- `kontaktinfo` som ikke ser ut som en e-postadresse
- lenke i beskrivelsen som ikke er `http` eller `https`
- ukjent fase eller fagområde, og duplikate id-er
- orgnr som mangler navn i `ki-tiltak-virksomhetsnavn.json`

Feilmeldingen navngir tiltaket, for eksempel `ukjent KI-type på #DataSaman`.

Nye felt stoppes ikke. De vises først når koden tar dem i bruk.
