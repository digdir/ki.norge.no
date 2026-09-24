# ki-tiltak.json

Datasettet bak `/ki-tiltak`. Filen vedlikeholdes manuelt av redaksjonen. Det finnes ikke lenger noe byggeskript som genererer den, så det du skriver her er det siden viser.

Legg merke til at filen leses ved bygg, ikke ved hvert sidevisning. Endringer krever en ny deploy før de er synlige.

## Legge til et tiltak

Kopier et eksisterende objekt, lim det inn på riktig plass i lista, og fyll ut feltene.

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

De seks feltene over er påkrevd. Nye tiltak kan i tillegg ha `fase`, `kiType`, `leveranse` og `kontaktinfo`, se [docs/ki-tiltak-felt.md](../../../../docs/ki-tiltak-felt.md). Der står også hvordan du limer inn et nytt tiltak rett fra e-posten.

## Feltene

| felt | krav |
|---|---|
| `id` | Unik. Lag en ny GUID, for eksempel med `uuidgen` i terminalen. Gjenbruk aldri en id |
| `navn` | Tiltakets navn, slik det skal vises |
| `virksomhet` | Visningsnavn med vanlig store og små bokstaver, ikke VERSALER |
| `orgnr` | Ni siffer, som i Brønnøysundregisteret |
| `fagomrade` | Nøyaktig én av verdiene i lista under |
| `beskrivelse` | Fritekst. Vises avkortet til tre linjer på kortet, i sin helhet i detaljvisningen |

### Gyldige fagområder

Kopier verdien ordrett, medregnet komma og små bokstaver.

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

Trenger du et fagområde som ikke står her, må det legges til i `FAGOMRADER` i `src/lib/ki-tiltak.ts` først. Si det til en utvikler.

## Punktlister i beskrivelse og formål

JSON har ingen plass til formatering, så linjeskift skrives som `\n`. Linjer
som starter med et kulepunkt blir en ekte punktliste i detaljvisningen.

```json
"beskrivelse": "Dette er noen eksempler:\n• Første punkt\n• Andre punkt\n• Tredje punkt"
```

Det gir en innledning etterfulgt av en liste. Både `•`, `-` og `*` fungerer som
markør, og markøren fjernes før teksten vises.

Tre ting å være klar over.

**Et `\n` er to tegn**, bakstrek og n, ikke et ekte linjeskift. Trykker du enter
midt inne i en tekst, blir filen ugyldig JSON og bygget stopper.

**Kortet i oversikten viser ingen lister.** Der vises de tre første linjene som
løpende tekst, siden kortet bare er en smakebit. Hele lista vises når man åpner
tiltaket.

**Lim aldri rett fra Word.** Da følger det med usynlige tegn og gjerne `·` eller
`▪` i stedet for `•`. Gå via en ren tekstredigerer først.

## Én fallgruve

**Fase og fagområde er strenge.** En skrivefeil som `Gjennomføing` gjør at hele siden svarer med feil, ikke bare det ene kortet. Kopier verdien i stedet for å skrive den inn.

## Sjekk før du committer

```
cd apps/frontend && pnpm run test:unit
```

Testene sjekker unike id-er, gyldige fagområder og faser, påkrevde felt, at det ikke finnes ukjente felt, og sorteringen. De kjører også i CI, så en feil stopper bygget, men det er raskere å oppdage den lokalt.

Får du en feilmelding om JSON-syntaks, mangler det oftest et komma mellom to objekter, eller det står et komma etter det siste objektet i lista.

## Videre

Datasettet skal etter planen flyttes inn i Umbraco, slik at redaksjonen kan redigere tiltak i CMS-et i stedet for i denne filen. Fram til det er på plass er denne filen fasiten.
