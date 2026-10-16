# Passordregler for CMS-brukere

Vanlig pålogging til backofficet går via Entra ID, med «Microsoft»-knappen. Da har brukeren ikke noe passord i Umbraco. Reglene under gjelder bare lokale kontoer med passord, og lokal pålogging er fortsatt på ved siden av Entra ID.

## Hva passordet må inneholde

- **Minst 10 tegn**
- **Minst 2 unike tegn** (samme tegn kan ikke gjenta seg over alt)
- **Minst én stor bokstav** (A-Z)
- **Minst én liten bokstav** (a-z)
- **Minst ett spesialtegn** (`!@#$%^&*()-_+=` osv.)

Tall er ikke påkrevd, men anbefalt.

## Eksempler

| Passordet har | Godkjent | Hvorfor |
| --- | --- | --- |
| 8 tegn | Nei | For kort |
| 12 tegn, bare små bokstaver og tall | Nei | Mangler stor bokstav og spesialtegn |
| 12 tegn med store og små bokstaver og tall | Nei | Mangler spesialtegn |
| 14 tegn med store og små bokstaver og ett spesialtegn | Ja | Oppfyller alle krav |

## Hvorfor er dette nødvendig

CMS-et gir tilgang til alt innhold. Et svakt passord er lett å gjette eller knekke, og kan brukes til å publisere falskt innhold eller sabotere nettstedet.

## Hvis endringen av passordet feiler

Du skal få en melding som sier hvilken regel som mangler, for eksempel «Passordet må være minst 10 tegn». Følg meldingen, og prøv på nytt.

Får du bare «Unknown failure» uten detaljer, si fra til en utvikler. Da har noe brutt.

Reglene er definert i `apps/cms-umbraco/appsettings.json` under `Umbraco.CMS.Security.UserPasswordConfiguration`. De norske feilmeldingene kommer fra `NorwegianIdentityErrorDescriber.cs`.
