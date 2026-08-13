# Testfixturer for tt02

Artikler som presser skjemaet, lagret som uSync Content-filer og lastet inn i tt02 på kommando.

## Hvorfor de ligger i git

tt02 hadde slike fixturer før, laget direkte i backoffice. De mistet blokkinnholdet sitt da
skjemaet ble re-nøklet 5. august, ingen merket det, og 13. august ble de feid vekk sammen med
resten av tt02s eget innhold fordi de så ut som rot.

Løse innholdsnoder i et delt miljø har ingen som passer på seg. Her ligger de under versjons-
kontroll, de dukker opp i diffen når noen endrer en content-type, og en opprydding kan ikke ta
dem ved et uhell.

## Bruk

```bash
scripts/last-testfixturer-tt02.sh          # alle utenom brutte referanser
scripts/last-testfixturer-tt02.sh --alle   # også brutte referanser
scripts/last-testfixturer-tt02.sh --sjekk  # vis hva som ville blitt kopiert
```

Scriptet kopierer `.config`-filene inn i tt02-poddens uSync-mappe. Import gjøres i backoffice
(Settings, uSync, Import) med settet `Speiling`. Aldri Clean.

Fixturene får parent `cadd506a-4470-4f3d-9a66-3a4369bdc238` (Artikler) og dukker opp i
artikkellista på tt02. Nøklene starter alle med `7e57f1c0`, så de er lette å kjenne igjen og
kan ikke kollidere med ekte innhold.

De ligger på frontenden under `/artikler/<slug>`, for eksempel
`https://ki.test.norge.no/artikler/testfixtur-alle-moduler/`. Delivery API-et rapporterer
rota (`/testfixtur-alle-moduler/`), men den ruta finnes ikke i Astro.

Verifisert 2026-08-13: alle 8 blokktypene rendrer, ingen faller ut, og Delivery API-et er
friskt på `take=100` etter at fixturene lå inne.

Prod kan ikke importere innhold uansett (`Default`-settet er eksport-only), og scriptet nekter
å kjøre mot en prod-kontekst.

## Fixturene

| Fil | Hva den tester |
|---|---|
| `testfixtur-alle-moduler.config` | Hver av de 8 blokktypene `artikkel.innhold` tillater, i én artikkel. Regresjonsvakt mot at en modul faller til Unsupported. |
| `testfixtur-minimal.config` | Bare påkrevde felt. Fanger rendering som antar at valgfrie felt finnes. |
| `testfixtur-fiendtlig-innhold.config` | Ekstremt lang tittel, emoji og kombinerende tegn, RTL, nullbredde-tegn, rå HTML limt inn fra Word/Teams, script- og iframe-tagger, tabell uten thead, tre nivåer nøstet liste, tomme avsnitt, ugyldig e-post, tomme valgfrie felt i blokker. |
| `testfixtur-brutte-referanser.config` | Mediepeker og lenke til nøkler som ikke finnes. |

### Om brutte referanser

Den siste lastes bare med `--alle`, og det er med vilje. Vi vet fra 13. august at én ødelagt
property inne i en Block List kan velte hele Delivery API-responsen med HTTP 500, ikke bare
den ene noden. Da ga en dropdown med rå streng i stedet for JSON 500 på alle spørringer med
`take>=50`.

Å finne ut om en brutt mediepeker gjør det samme er nettopp poenget med fixturen, men vær
forberedt: skjer det, blir tt02s Delivery API delvis nede til du sletter noden i backoffice.
Frontenden tåler det bedre enn API-et, siden den henter i mindre porsjoner.

## Legge til en fixtur

Filene ble generert én gang og redigeres nå for hånd. Formatet er uSync sitt Content-format:
XML med property-verdier i CDATA, der Block List-verdier er JSON med `contentData`,
`settingsData`, `expose` og `layout`. Kopier en eksisterende fixtur og bytt nøkler.

Alle nøkler i en ny fixtur må være unike. Hold deg til mønsteret `7e57f1c0-NNNN-4000-8000-…`
så de fortsatt er gjenkjennelige.
