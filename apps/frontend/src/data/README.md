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
| `virksomhet` | Navnet slik det står i eksporten, også i VERSALER. Sida viser navnet fra navnetabellen, se under. Flere virksomheter skrives som liste, med hovedvirksomheten først |
| `orgnr` | Ni siffer, som i Brønnøysundregisteret. Liste i samme rekkefølge når `virksomhet` er liste |
| `fagomrade` | Nøyaktig én av verdiene i lista under |
| `beskrivelse` | Fritekst. Vises avkortet til tre linjer på kortet, i sin helhet i detaljvisningen |

Flere virksomheter:

```json
"virksomhet": ["Helse Bergen HF", "Helse Førde HF"],
"orgnr": ["983974724", "983974732"]
```

I detaljvisningen står de én per linje. På kortet står de etter hverandre med komma, kuttet med «…» etter to linjer.

Et felt uten verdi vises ikke. Det gjelder `null`, tom tekst, bare mellomrom, tomme lister, og `NA`, `N/A`, `-`, `–`, `null` og «ikke oppgitt».

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

Testene sjekker at fila er gyldig JSON, unike id-er, gyldige fagområder og faser, påkrevde felt, at ingen fjernede felt er med, og sorteringen. De kjører også i CI, så en feil stopper bygget, men det er raskere å oppdage den lokalt.

Er det en syntaksfeil, sier testen `ki-tiltak.json > er gyldig JSON` hvilken linje det gjelder, og hva som trolig mangler. Oftest er det et komma mellom to tiltak, et komma for mye etter det siste, eller en `{` som mangler.

## Virksomhetsnavn

`ki-tiltak-virksomhetsnavn.json` gir hvert orgnr et visningsnavn med vanlige store og små bokstaver. Ny virksomhet i dataene betyr en ny linje der, ellers stopper testene. `VIRKSOMHETSNAVN` i `src/lib/ki-tiltak.ts` bytter mellom `'tabell'` (standard) og `'register'` (navnene i dataene), for å kunne bytte raskt. Med `'tabell'` får en virksomhet som ennå ikke står i tabellen, stor forbokstav i stedet for VERSALER, til den er lagt inn.

## Videre

Datasettet skal etter planen flyttes inn i Umbraco, slik at redaksjonen kan redigere tiltak i CMS-et i stedet for i denne filen. Fram til det er på plass er denne filen fasiten.

