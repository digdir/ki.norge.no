# Felt i ki-tiltak.json

Referanse for den som fører inn tiltak i `apps/frontend/src/data/ki-tiltak.json`.

Feltnavnene er med vilje identiske med feltene i innsendingsskjemaet og i e-posten som kommer til `ki-tiltak@kin.norge.no`. Avskriften skal være mekanisk: står det `kiType` i e-posten, heter det `kiType` i fila.

## Hele modellen

```json
{
  "id": "bda57bb4-992e-4b12-adb5-1fddaa34f8b4",
  "navn": "#DataSaman",
  "virksomhet": "Entur AS",
  "orgnr": "917422575",
  "fagomrade": "Trafikk og transport",
  "beskrivelse": "Entur jobbar systematisk for å teste og utnytte moglegheitene som følgjer av forbetringar innan KI.",
  "status": "Gjennomføring",

  "kiType": ["Generativ KI", "Språkteknologi"],
  "kiTypeAnnet": "",
  "leveranse": ["Pilot"],
  "leveranseAnnet": "",
  "kontaktinfo": "post@entur.no"
}
```

De seks øverste er påkrevd og finnes på alle 58 oppføringene fra før. De fem nederste er nye og valgfrie.

## De nye feltene

| Felt | Type | Gyldige verdier |
| --- | --- | --- |
| `kiType` | liste | `Generativ KI`, `Prediktiv KI`, `Agentisk KI`, `Språkteknologi`, `Computer Vision`, `Anbefalingssystemer`, `Annet` |
| `kiTypeAnnet` | tekst | Fritekst. Bare når `kiType` inneholder `Annet` |
| `leveranse` | liste | `PoC`, `MVP`, `Pilot`, `Løsning i produksjon`, `Annet` |
| `leveranseAnnet` | tekst | Fritekst. Bare når `leveranse` inneholder `Annet` |
| `kontaktinfo` | tekst | E-postadresse |

`status` er feltet som heter **Fase** i skjemaet og i visningen. Det finnes fra før. Gyldige verdier er `Innsikt og planlegging`, `Gjennomføring` og `I drift`.

## Regler som er verdt å kjenne

**Valgfritt betyr virkelig valgfritt.** Utelat feltet, eller la det stå tomt, det gjør ingen forskjell. Et tomt felt vises ikke i det hele tatt, heller ikke overskriften. Et tiltak med bare beskrivelse og tema skal se ferdig ut, ikke halvt utfylt.

**Ikke etterfyll de gamle.** De nye feltene gjelder bare tiltak som er sendt inn eller oppdatert via skjemaet på /ki-tiltak. Ingen skal gjette seg til hvilken KI-type en virksomhet bruker.

**«Annet» erstattes av friteksten.** Skriver du `"leveranse": ["Pilot", "Annet"]` og `"leveranseAnnet": "Intern verktøykasse"`, viser sida «Pilot» og «Intern verktøykasse». Ordet «Annet» vises ikke. Står friteksten uten at `Annet` er i lista, blir teksten aldri vist, og en test stopper det.

**Kontaktadressen blir publisert.** Både på nettstedet og i git-historikken til et offentlig repo. Bruk en virksomhetsadresse, ikke en personlig.

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
- ukjent fagområde eller status, og duplikate id-er, som fra før

Feilmeldingen navngir tiltaket, for eksempel `ukjent KI-type på #DataSaman`.
