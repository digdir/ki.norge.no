# Passord-regler for CMS-brukere

For Sara, Eira og andre redaktører som lager nye brukere i Umbraco eller endrer passord.

## Hva passordet må inneholde

- **Minst 10 tegn**
- **Minst 2 unike tegn** (samme tegn kan ikke gjenta seg over alt)
- **Minst én stor bokstav** (A-Z)
- **Minst én liten bokstav** (a-z)
- **Minst ett spesialtegn** (`!@#$%^&*()-_+=` osv.)

Tall er ikke påkrevd, men anbefalt.

## Eksempler

| Passord            | Godkjent | Hvorfor                          |
| ------------------ | -------- | -------------------------------- |
| `kort1`            | Nei      | For kort                         |
| `passord123`       | Nei      | Mangler stor bokstav, spesialtegn |
| `Passord123`       | Nei      | Mangler spesialtegn              |
| `Sterkt!Passord`   | Ja       | Oppfyller alle krav              |
| `KiNorge2026!`     | Ja       | Oppfyller alle krav              |

## Hvorfor er dette nødvendig

CMS-en gir admin-tilgang til alt innhold. Et svakt passord gjør det enkelt å gjette eller knekke, og kan brukes til å publisere falskt innhold eller sabotere siden.

## Hvis du får "Unknown failure" når du endrer passord

Det er Umbraco som er tunghørt — feilen betyr som regel at passordet ikke møter reglene over. Prøv et lengre passord med både store/små bokstaver og minst ett spesialtegn.

(Reglene er definert i `apps/cms-umbraco/appsettings.json` under `Umbraco.CMS.Security.UserPasswordConfiguration` om du vil justere dem.)
