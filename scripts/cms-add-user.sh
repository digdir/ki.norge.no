#!/usr/bin/env bash
# Gi en person tilgang til Umbraco-backoffice via Entra ID.
#
# Tilgang styres av medlemskap i Entra-grupper, ikke i Umbraco. Gruppene bærer
# app-roller som koden mapper til Umbraco-grupper, se
# apps/cms-umbraco/CustomAuthentication/MicrosoftEntraIdBackOfficeExternalLoginProviderOptions.cs
#   umbraco-admin    -> admin
#   umbraco-redaktor -> editor
# Uten rolle-match nektes pålogging.
#
# Bruk:
#   pnpm run cms:add-user <e-post> redaktor                 redaktør i prod
#   pnpm run cms:add-user <e-post> admin                    administrator i prod
#   pnpm run cms:add-user <e-post> redaktor --dev           samme, men tt02
#   pnpm run cms:add-user <e-post> redaktor --uten-epost    inviter uten e-post til personen
#   pnpm run cms:add-user <e-post> redaktor --navn="Fornavn Etternavn"
#   pnpm run cms:add-user <e-post> redaktor -y --inviter    uten tilsyn, se under
#
#   Mangler personen i tenanten, tilbyr scriptet å invitere henne som B2B-gjest.
#   Det trengs ikke noe flagg for det, bekreftelsen viser adressen. Kjører du
#   med -y må du legge til --inviter, siden ingen da ser adressen først.
#
#   Visningsnavnet utledes fra e-posten (asli.aydemir -> Asli Aydemir) og kan
#   KUN settes idet gjesten opprettes. Å rette det etterpå krever
#   directory-rettigheter vi ikke har. Stemmer ikke gjetningen, bruk --navn=.
#
# Fallgruver scriptet håndterer, alle lært den harde veien:
#   - Digdir-folk er B2B-gjester i ai-dev-tenanten med UPN på formen
#     navn_digdir.no#EXT#@brreg.onmicrosoft.com. `az ad user show --id navn@digdir.no`
#     FEILER derfor med "Resource not found". Oppslag må gå via mail-filteret.
#   - Samme person kan ha en aas-*-adminkonto ved siden av gjestekontoen. Treffer
#     e-posten flere kontoer, stopper scriptet og lister dem heller enn å gjette.
#   - Personen finnes kanskje ikke i tenanten i det hele tatt. Da trengs en
#     B2B-invitasjon først, ikke bare et gruppemedlemskap. Scriptet tilbyr den.
#
# Digdir og ai-dev har automatisk innløsning av gjesteinvitasjoner, så en invitert
# konto står som Accepted med én gang. Personen trenger ikke gjøre noe med
# invitasjons-e-posten, den er kun informasjon.
#
# Etter kjøring må personen logge inn én gang med Sign in with Microsoft. Lander
# brukeren deaktivert i Umbraco -> Users, må en administrator enable den.
#
# Krever az innlogget som eier av gruppene. Ikke VPN.

set -euo pipefail

TENANT="cd0026d8-283b-4a55-9bfa-d0ef4a8ba21c"

MILJO="prod"
NAVN=""
INVITER=0
SEND_EPOST=1
BEKREFT=1
EPOST=""
ROLLE=""

bruk() {
    awk '/^# Bruk:/{v=1} v{if (/^#$/ && !blank) {blank=1} else if (/^# [^ ]/ && blank) exit; print}' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-1}"
}

for arg in "$@"; do
    case "$arg" in
        --dev) MILJO="dev" ;;
        --prod) MILJO="prod" ;;
        --inviter) INVITER=1 ;;
        --uten-epost) SEND_EPOST=0 ;;
        --navn=*) NAVN="${arg#--navn=}" ;;
        -y|--ja) BEKREFT=0 ;;
        -h|--help) bruk 0 ;;
        -*) echo "Ukjent flagg: $arg" >&2; exit 1 ;;
        *)
            if [[ -z "$EPOST" ]]; then EPOST="$arg"
            elif [[ -z "$ROLLE" ]]; then ROLLE="$arg"
            else echo "For mange argumenter: $arg" >&2; exit 1
            fi
            ;;
    esac
done

[[ -z "$EPOST" || -z "$ROLLE" ]] && bruk 1
[[ "$EPOST" != *@* ]] && { echo "Ser ikke ut som en e-postadresse: $EPOST" >&2; exit 1; }

# Visningsnavnet kan KUN settes idet gjesten inviteres. Uten det havner
# "fornavn.etternavn" i katalogen, og det navnet følger med inn i Umbraco via
# name-claimet. Å rette det etterpå krever directory-rettigheter Lars ikke har,
# så gjetningen her er eneste sjanse. Overstyres med --navn="Fornavn Etternavn".
if [[ -z "$NAVN" ]]; then
    NAVN=$(python3 - "$EPOST" <<'PYNAVN'
import sys
lokal = sys.argv[1].split("@")[0]
deler = [d for d in lokal.replace("_", ".").split(".") if d]
print(" ".join(d[:1].upper() + d[1:] for d in deler))
PYNAVN
)
fi

case "$ROLLE" in
    redaktor|redaktør|editor) GRUPPE_ROLLE="Redaktør"; UMBRACO_GRUPPE="editor" ;;
    admin|administrator) GRUPPE_ROLLE="Administrator"; UMBRACO_GRUPPE="admin" ;;
    *) echo "Rollen må være redaktor eller admin, fikk: $ROLLE" >&2; exit 1 ;;
esac

if [[ "$MILJO" == "prod" ]]; then
    GRUPPE_MILJO="Prod"
    CMS_URL="https://cms.ki.norge.no/umbraco"
else
    GRUPPE_MILJO="Dev"
    CMS_URL="https://cms.ki.test.norge.no/umbraco"
fi

GRUPPE_NAVN="KI Norge ${GRUPPE_ROLLE} ${GRUPPE_MILJO}"

# --- az-sesjon ---------------------------------------------------------------

if ! AKTIV_TENANT=$(az account show --query tenantId -o tsv 2>/dev/null); then
    echo "Ikke innlogget i az. Kjør: az login" >&2
    exit 1
fi

if [[ "$AKTIV_TENANT" != "$TENANT" ]]; then
    echo "Feil tenant. Aktiv: $AKTIV_TENANT, forventet ai-dev: $TENANT" >&2
    echo "Kjør: az login --tenant $TENANT" >&2
    exit 1
fi

# --- finn gruppa -------------------------------------------------------------

GRUPPE_ID=$(az ad group list --filter "displayName eq '${GRUPPE_NAVN}'" --query "[].id" -o tsv)
ANTALL_GRUPPER=$(grep -c . <<<"$GRUPPE_ID" || true)

if [[ -z "$GRUPPE_ID" ]]; then
    echo "Fant ingen Entra-gruppe med navn \"${GRUPPE_NAVN}\"." >&2
    echo "Eksisterende KI Norge-grupper:" >&2
    az ad group list --filter "startswith(displayName,'KI Norge')" --query "[].displayName" -o tsv >&2
    exit 1
fi

if [[ "$ANTALL_GRUPPER" -ne 1 ]]; then
    echo "Flere grupper heter \"${GRUPPE_NAVN}\". Rydd opp i Entra før du kjører dette." >&2
    exit 1
fi

# --- finn personen -----------------------------------------------------------
# Oppslag på mail, ikke UPN. Gjestekontoer har UPN navn_digdir.no#EXT#@... og
# `az ad user show --id navn@digdir.no` finner dem ikke.

TREFF=$(az ad user list --filter "mail eq '${EPOST}'" \
    --query "[].{id:id,navn:displayName,upn:userPrincipalName}" -o tsv)
ANTALL_TREFF=$(grep -c . <<<"$TREFF" || true)

if [[ "$ANTALL_TREFF" -gt 1 ]]; then
    echo "E-posten ${EPOST} treffer flere kontoer:" >&2
    echo "$TREFF" >&2
    echo >&2
    echo "Typisk en aas-*-adminkonto ved siden av gjestekontoen. Legg til riktig konto manuelt:" >&2
    echo "  az ad group member add --group ${GRUPPE_ID} --member-id <objekt-id>" >&2
    exit 1
fi

if [[ -z "$TREFF" ]]; then
    # Finnes ikke personen i tenanten, er en B2B-invitasjon eneste vei videre.
    # Da tilbyr scriptet den framfor å avbryte og be deg kjøre på nytt med et
    # flagg. Bekreftelsen under viser adressen, og det er den som fanger en
    # skrivefeil, ikke et flagg du uansett ville satt.
    #
    # Unntaket er -y. Da ser ingen adressen før den brukes, og en skrivefeil
    # ville opprettet en gjestekonto for en fremmed og sendt vedkommende
    # e-post. Uten tilsyn kreves derfor --inviter som et eksplisitt ja.
    if [[ "$BEKREFT" -eq 0 && "$INVITER" -eq 0 ]]; then
        echo "Fant ingen bruker med e-post ${EPOST} i ai-dev-tenanten." >&2
        echo >&2
        echo "Med -y inviterer scriptet ikke på egen hånd, siden ingen får se" >&2
        echo "adressen før den brukes. Er den riktig, legg til --inviter." >&2
        exit 1
    fi

    echo "Fant ingen bruker med e-post ${EPOST} i ai-dev-tenanten."
    echo "Personen må inviteres som B2B-gjest for å kunne logge inn."
    echo "Visningsnavn blir \"${NAVN}\". Det kan IKKE endres etterpå; bruk"
    echo "--navn=\"Fornavn Etternavn\" hvis dette er feil."
    if [[ "$SEND_EPOST" -eq 1 ]]; then
        echo "Det sendes en invitasjons-e-post fra Microsoft til ${EPOST}."
    else
        echo "Ingen e-post sendes. Du må selv fortelle personen at hun skal logge inn på ${CMS_URL}."
    fi

    if [[ "$BEKREFT" -eq 1 ]]; then
        read -r -p "Fortsette? [j/N] " svar
        [[ "$svar" =~ ^[jJyY]$ ]] || { echo "Avbrutt."; exit 0; }
    fi

    INVITASJON=$(mktemp)
    trap 'rm -f "$INVITASJON"' EXIT

    if [[ "$SEND_EPOST" -eq 1 ]]; then
        cat >"$INVITASJON" <<JSON
{
  "invitedUserEmailAddress": "${EPOST}",
  "invitedUserDisplayName": "${NAVN}",
  "inviteRedirectUrl": "${CMS_URL}",
  "sendInvitationMessage": true,
  "invitedUserMessageInfo": {
    "messageLanguage": "nb-NO",
    "customizedMessageBody": "Du er invitert til CMS-et for ki.norge.no. Godta invitasjonen, og logg deretter inn på ${CMS_URL} med knappen Sign in with Microsoft."
  }
}
JSON
    else
        cat >"$INVITASJON" <<JSON
{
  "invitedUserEmailAddress": "${EPOST}",
  "invitedUserDisplayName": "${NAVN}",
  "inviteRedirectUrl": "${CMS_URL}",
  "sendInvitationMessage": false
}
JSON
    fi

    BRUKER_ID=$(az rest --method POST --url "https://graph.microsoft.com/v1.0/invitations" \
        --headers "Content-Type=application/json" \
        --body "@${INVITASJON}" \
        --query "invitedUser.id" -o tsv)

    BRUKER_NAVN="$EPOST"
    BRUKER_UPN=$(az ad user show --id "$BRUKER_ID" --query userPrincipalName -o tsv)
    echo "Gjestekonto opprettet: ${BRUKER_UPN}"
else
    BRUKER_ID=$(cut -f1 <<<"$TREFF")
    BRUKER_NAVN=$(cut -f2 <<<"$TREFF")
    BRUKER_UPN=$(cut -f3 <<<"$TREFF")

    if [[ "$BRUKER_UPN" == aas-* ]]; then
        echo "Advarsel: ${BRUKER_UPN} ser ut som en aas-adminkonto, ikke en vanlig gjestekonto." >&2
    fi
fi

# --- legg til i gruppa -------------------------------------------------------

ER_MEDLEM=$(az ad group member check --group "$GRUPPE_ID" --member-id "$BRUKER_ID" \
    --query value -o tsv 2>/dev/null || echo "false")

if [[ "$ER_MEDLEM" == "true" ]]; then
    echo "${BRUKER_NAVN} er allerede medlem av \"${GRUPPE_NAVN}\". Ingenting å gjøre."
    exit 0
fi

echo
echo "  Person:  ${BRUKER_NAVN} <${EPOST}>"
echo "  Konto:   ${BRUKER_UPN}"
echo "  Gruppe:  ${GRUPPE_NAVN}"
echo "  Gir:     Umbraco-gruppe \"${UMBRACO_GRUPPE}\" på ${CMS_URL}"
echo

if [[ "$BEKREFT" -eq 1 ]]; then
    read -r -p "Legge til? [j/N] " svar
    [[ "$svar" =~ ^[jJyY]$ ]] || { echo "Avbrutt."; exit 0; }
fi

az ad group member add --group "$GRUPPE_ID" --member-id "$BRUKER_ID"

echo "Lagt til i ${GRUPPE_NAVN}."
echo
echo "Neste steg:"
echo "  1. ${BRUKER_NAVN} går til ${CMS_URL} og trykker Sign in with Microsoft."
echo "  2. Lander brukeren deaktivert i Umbraco -> Users, enable den der."
