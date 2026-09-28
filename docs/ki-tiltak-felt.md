# Felt i ki-tiltak.json

Referanse for feltene i `apps/frontend/src/data/ki-tiltak.json`. Fila lages av importen fra registerets eksport og redigeres ikke for hånd, se [apps/frontend/src/data/README.md](../apps/frontend/src/data/README.md).

E-posten fra skjemaet på /ki-tiltak har fortsatt en blokk som heter **TIL KI-TILTAK.JSON**. Den skal ikke limes inn i fila. Neste import overskriver den, fordi nye tiltak kommer inn via registeret.

## Modellen

```json
{
  "id": "58d19bb6-5f0d-480b-ac94-378da3548f76",
  "navn": "#DataSaman",
  "virksomhet": "Entur AS",
  "orgnr": "917422575",
  "fagomrade": "Trafikk og transport",
  "beskrivelse": "Entur jobbar systematisk for å teste og utnytte moglegheitene som følgjer av forbetringar innan KI.",
  "fase": "Gjennomføring",
  "kiType": ["Generativ KI", "Språkteknologi"],
  "leveranse": ["Pilot"],
  "kontaktinfo": "post@entur.no"
}
```

`id`, `navn`, `virksomhet`, `orgnr` og `fagomrade` finnes på alle som publiseres. Resten er valgfritt.

Flere virksomheter skrives som lister i samme rekkefølge, med hovedvirksomheten først: `"virksomhet": ["Helse Bergen HF", "Helse Førde HF"]` og `"orgnr": ["983974724", "983974732"]`.

| Felt | Type | Gyldige verdier |
| --- | --- | --- |
| `virksomhet` | tekst eller liste | Visningsnavn fra navnetabellen. Hovedvirksomheten først |
| `orgnr` | tekst eller liste | Samme rekkefølge som `virksomhet` |
| `fase` | tekst | `Innsikt og planlegging`, `Gjennomføring`, `I drift`. Vises som **Fase** |
| `kiType` | liste | `Generativ KI`, `Prediktiv KI`, `Agentisk KI`, `Språkteknologi`, `Computer Vision`, `Anbefalingssystemer`, `Annet` |
| `kiTypeAnnet` | tekst | Fritekst. Bare når `kiType` inneholder `Annet` |
| `leveranse` | liste | `PoC`, `MVP`, `Pilot`, `Løsning i produksjon`, `Annet` |
| `leveranseAnnet` | tekst | Fritekst. Bare når `leveranse` inneholder `Annet` |
| `kontaktinfo` | tekst | E-postadresse |

Modellen på sida tåler også registerets form direkte, med `null` hvor som helst.

**Det finnes ikke noe status-felt.** `fase` er svaret på skjemaets «Hvilken fase er tiltaket i?».

## Visning

**Flere virksomheter** vises én per linje i detaljvisningen, med hovedvirksomheten først. På kortene står de etter hverandre med komma, kuttet med «…» etter to linjer.

**Uten verdi vises aldri.** Det gjelder null, tom tekst, tekst med bare mellomrom, tomme lister, og plassholderne `NA`, `N/A`, `-`, `–`, `null` og «ikke oppgitt». Et felt uten verdi vises ikke i det hele tatt, heller ikke overskriften.

**«Annet» erstattes av friteksten.** `"leveranse": ["Pilot", "Annet"]` og `"leveranseAnnet": "Intern verktøykasse"` vises som «Pilot og Intern verktøykasse».

**Kontaktadressen blir publisert.** Både på nettstedet og i git-historikken til et offentlig repo.

**Lenker i beskrivelsen** skrives som markdown, `[Se rapporten](https://example.no/rapport)`. Bare `http` og `https`. Linjer som starter med `-`, `•` eller `1.` blir punktlister i detaljvisningen.

## Hva testene fanger

`pnpm --filter ki-norge-frontend run test:unit` kjører i CI på hver PR og stopper:

- syntaksfeil, med linje og forklaring
- felt som er fjernet: `status`, `formaal`, `oppstart` og `slutt`
- ukjent verdi i `kiType` eller `leveranse`, og duplikater eller tomme verdier i dem
- `Annet`-fritekst uten at `Annet` er valgt
- `kontaktinfo` som ikke ser ut som en e-postadresse
- lenke i beskrivelsen som ikke er `http` eller `https`
- ukjent fase eller fagområde, publiserte tiltak uten fagområde, og duplikate id-er
- virksomhetsnavn med bare versaler
- publiserte orgnr uten navn i navnetabellen
- mål i id-tabellen som ikke finnes

Reglene for import og visning har egne enhetstester i `src/lib/ki-tiltak-modell.test.ts`.
