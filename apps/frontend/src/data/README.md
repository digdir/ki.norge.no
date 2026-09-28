# KI-tiltak-dataene

Datasettet bak `/ki-tiltak`. Ingenting her redigeres for hånd.

Registeret er kilden. Tiltak sendes inn via skjemaet på /ki-tiltak til teamet som eier oversikten, og innholdet kurateres der. Vi viser det kuraterte innholdet. Skal en tekst, en fase eller et fagområde endres, skjer det i registeret, og kommer hit med neste import.

| Fil | Hva | Lages av |
| --- | --- | --- |
| `ki-tiltak.json` | Tiltakene som publiseres | Importen |
| `ki-tiltak-id-alias.json` | Gammel id til ny id, så gamle `?tiltak=`-lenker virker | Importen. Samler opp over flere importer |
| `ki-tiltak-virksomheter.json` | Orgnr til visningsnavn | Importen fører `registernavn`. `navn` fylles inn av redaksjonen |

## Importere en ny eksport

```
node scripts/importer-ki-tiltak.mjs ~/Downloads/ki-initiativer-2026-09-27.json --bare-rapport
node scripts/importer-ki-tiltak.mjs ~/Downloads/ki-initiativer-2026-09-27.json
pnpm --filter ki-norge-frontend run test:unit
```

Kjør med `--bare-rapport` først. Da skrives ingenting, og du ser hva som vil skje.

**Eksportfila skal ikke inn i repoet.** Den har kontaktadresser for alle tiltakene, også de som ikke publiseres. Bare de tre filene over committes.

`ki-tiltak.json` leses ved bygg. En ny import er ikke synlig før neste deploy.

## Hva importen gjør

1. **Rensing.** `\r\n` blir `\n`, og mellomrom på slutten av linjer fjernes. Verdier uten innhold utelates: tom tekst, bare mellomrom, tomme lister, og plassholderne `NA`, `N/A`, `-`, `–`, `null` og «ikke oppgitt». I tekster satt sammen med `;` fjernes bitene som er plassholdere.
2. **KI-type.** Registerets «Språkteknologi (NLP)» blir «Språkteknologi». Andre ukjente verdier rapporteres, og testene stopper dem.
3. **Nummererte varianter** slås sammen. Registeret har ett tiltak per helseforetak for samme produkt, «BoneView 1» til «BoneView 4». Inntil noen bestemmer noe annet vises de som ett tiltak med alle virksomhetene. Valgene står i `slaaSammenVarianter` i `src/lib/ki-tiltak-modell.ts`.
4. **Uten fagområde holdes tiltaket tilbake**, og står i rapporten, til fagområdet er satt i registeret.
5. **Visningsnavn** slås opp på orgnr i `ki-tiltak-virksomheter.json`. Mangler en publisert virksomhet navn, stopper importen med en liste og skriver ingenting.
6. **Id-er.** Får et tiltak ny id i registeret, matches det på navn, og den gamle id-en føres i `ki-tiltak-id-alias.json`. Rapporten sier hvor mange som fikk ny id siden forrige fil.

## Navnetabellen

```json
"983974724": { "navn": "Helse Bergen HF", "forslag": true, "registernavn": "HELSE BERGEN HF" }
```

- `navn` er det som vises. Vanlig store og små bokstaver, ikke VERSALER.
- `forslag` betyr at navnet er foreslått av en utvikler og ikke er sett av redaksjonen. Slett feltet når navnet er godkjent.
- `registernavn` er navnet i siste eksport, ført inn av importen. Det brukes ikke på sida.

Har importen stoppet på et manglende navn, legg inn `navn` for orgnr-et og kjør importen på nytt.

## Gyldige fagområder

Registeret må bruke disse ordrett. Et annet fagområde holdes tilbake, og står i rapporten.

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

Et nytt fagområde legges til i `FAGOMRADER` i `src/lib/ki-tiltak-modell.ts`.

Feltene og visningsreglene står i [docs/ki-tiltak-felt.md](../../../../docs/ki-tiltak-felt.md).
