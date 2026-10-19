#!/usr/bin/env bash
# Give a person access to the Umbraco backoffice via Entra ID.
#
# Access is controlled by membership in Entra groups, not in Umbraco. The groups carry
# app roles that the code maps to Umbraco groups, see
# apps/cms-umbraco/CustomAuthentication/MicrosoftEntraIdBackOfficeExternalLoginProviderOptions.cs
#   umbraco-admin    -> admin
#   umbraco-redaktor -> editor
# Without a role match, login is denied.
#
# Usage:
#   pnpm run cms:add-user <email> redaktor                  editor in prod
#   pnpm run cms:add-user <email> admin                     administrator in prod
#   pnpm run cms:add-user <email> redaktor --dev            same, but tt02
#   pnpm run cms:add-user <email> redaktor --uten-epost     invite without email to the person
#   pnpm run cms:add-user <email> redaktor --navn="First Last"
#   pnpm run cms:add-user <email> redaktor -y --inviter     unattended, see below
#
#   If the person is missing from the tenant, the script offers to invite them as a guest.
#   No flag is needed for that, the confirmation shows the address. If you run
#   with -y you must add --inviter, since nobody then sees the address first.
#
#   The display name is derived from the email (asli.aydemir -> Asli Aydemir) and can
#   ONLY be set when the guest is created. Fixing it afterwards requires
#   directory permissions we do not have. If the guess is wrong, use --navn=.
#
# Pitfalls the script handles, all learned the hard way:
#   - Digdir people are B2B guests in the ai-dev tenant with a UPN of the form
#     navn_digdir.no#EXT#@brreg.onmicrosoft.com. `az ad user show --id navn@digdir.no`
#     therefore FAILS with "Resource not found". Lookups must go via the mail filter.
#   - The same person can have an aas-* admin account next to the guest account. If
#     the email matches several accounts, the script stops and lists them rather than guessing.
#   - The person may not exist in the tenant at all. Then a B2B
#     invitation is needed first, not just a group membership. The script offers it.
#
# Digdir and ai-dev have automatic redemption of guest invitations, so an invited
# account shows as Accepted right away. The person does not need to do anything with
# the invitation email, it is for information only.
#
# After running, the person must log in once with Sign in with Microsoft. If
# the user lands deactivated in Umbraco -> Users, an administrator must enable it.
#
# Requires az logged in as owner of the groups. No VPN.

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
    awk '/^# Usage:/{v=1} v{if (/^#$/ && !blank) {blank=1} else if (/^# [^ ]/ && blank) exit; print}' "$0" | sed 's/^# \{0,1\}//'
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
        -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
        *)
            if [[ -z "$EPOST" ]]; then EPOST="$arg"
            elif [[ -z "$ROLLE" ]]; then ROLLE="$arg"
            else echo "Too many arguments: $arg" >&2; exit 1
            fi
            ;;
    esac
done

[[ -z "$EPOST" || -z "$ROLLE" ]] && bruk 1
[[ "$EPOST" != *@* ]] && { echo "Does not look like an email address: $EPOST" >&2; exit 1; }

# The display name can ONLY be set when the guest is invited. Without it
# "first.last" ends up in the directory, and that name follows into Umbraco via
# the name claim. Fixing it afterwards requires directory permissions Lars does not have,
# so the guess here is the only chance. Overridden with --navn="First Last".
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
    red|redaktor|redaktør|editor) GRUPPE_ROLLE="Redaktør"; UMBRACO_GRUPPE="editor" ;;
    admin|administrator) GRUPPE_ROLLE="Administrator"; UMBRACO_GRUPPE="admin" ;;
    *) echo "The role must be redaktor (red) or admin, got: $ROLLE" >&2; exit 1 ;;
esac

if [[ "$MILJO" == "prod" ]]; then
    GRUPPE_MILJO="Prod"
    CMS_URL="https://cms.ki.norge.no/umbraco"
else
    GRUPPE_MILJO="Dev"
    CMS_URL="https://cms.ki.test.norge.no/umbraco"
fi

GRUPPE_NAVN="KI Norge ${GRUPPE_ROLLE} ${GRUPPE_MILJO}"

# --- az session --------------------------------------------------------------

if ! AKTIV_TENANT=$(az account show --query tenantId -o tsv 2>/dev/null); then
    echo "Not logged in to az. Run: az login" >&2
    exit 1
fi

if [[ "$AKTIV_TENANT" != "$TENANT" ]]; then
    echo "Wrong tenant. Active: $AKTIV_TENANT, expected ai-dev: $TENANT" >&2
    echo "Run: az login --tenant $TENANT" >&2
    exit 1
fi

# --- find the group ----------------------------------------------------------

GRUPPE_ID=$(az ad group list --filter "displayName eq '${GRUPPE_NAVN}'" --query "[].id" -o tsv)
ANTALL_GRUPPER=$(grep -c . <<<"$GRUPPE_ID" || true)

if [[ -z "$GRUPPE_ID" ]]; then
    echo "Found no Entra group named \"${GRUPPE_NAVN}\"." >&2
    echo "Existing KI Norge groups:" >&2
    az ad group list --filter "startswith(displayName,'KI Norge')" --query "[].displayName" -o tsv >&2
    exit 1
fi

if [[ "$ANTALL_GRUPPER" -ne 1 ]]; then
    echo "Several groups are named \"${GRUPPE_NAVN}\". Clean up in Entra before you run this." >&2
    exit 1
fi

# --- find the person ---------------------------------------------------------
# Lookup on mail, not UPN. Guest accounts have UPN navn_digdir.no#EXT#@... and
# `az ad user show --id navn@digdir.no` does not find them.

# Array projection, not dict: it guarantees the column order cut reads below.
TREFF=$(az ad user list --filter "mail eq '${EPOST}'" \
    --query "[].[id,displayName,userPrincipalName]" -o tsv)
ANTALL_TREFF=$(grep -c . <<<"$TREFF" || true)

if [[ "$ANTALL_TREFF" -gt 1 ]]; then
    echo "The email ${EPOST} matches several accounts:" >&2
    echo "$TREFF" >&2
    echo >&2
    echo "Typically an aas-* admin account next to the guest account. Add the right account manually:" >&2
    echo "  az ad group member add --group ${GRUPPE_ID} --member-id <object-id>" >&2
    exit 1
fi

if [[ -z "$TREFF" ]]; then
    # If the person does not exist in the tenant, a B2B invitation is the only way forward.
    # So the script offers it rather than aborting and asking you to run again with a
    # flag. The confirmation below shows the address, and that is what catches a
    # typo, not a flag you would have set anyway.
    #
    # The exception is -y. Then nobody sees the address before it is used, and a typo
    # would create a guest account for a stranger and send them an
    # email. Unattended, --inviter is therefore required as an explicit yes.
    if [[ "$BEKREFT" -eq 0 && "$INVITER" -eq 0 ]]; then
        echo "Found no user with email ${EPOST} in the ai-dev tenant." >&2
        echo >&2
        echo "With -y the script does not invite on its own, since nobody gets to see" >&2
        echo "the address before it is used. If it is correct, add --inviter." >&2
        exit 1
    fi

    echo "Found no user with email ${EPOST} in the ai-dev tenant."
    echo "The person must be invited as a B2B guest to be able to log in."
    echo "The display name will be \"${NAVN}\". It can NOT be changed afterwards; use"
    echo "--navn=\"First Last\" if this is wrong."
    if [[ "$SEND_EPOST" -eq 1 ]]; then
        echo "An invitation email is sent from Microsoft to ${EPOST}."
    else
        echo "No email is sent. You must tell the person yourself to log in at ${CMS_URL}."
    fi

    if [[ "$BEKREFT" -eq 1 ]]; then
        read -r -p "Continue? [y/N] " svar
        [[ "$svar" =~ ^[jJyY]$ ]] || { echo "Aborted."; exit 0; }
    fi

    INVITASJON=$(mktemp)
    trap 'rm -f "$INVITASJON"' EXIT

    # Built by python, not by a heredoc. A name with quotation marks would
    # otherwise produce invalid JSON and make the invitation fail.
    python3 - "$EPOST" "$NAVN" "$CMS_URL" "$SEND_EPOST" >"$INVITASJON" <<'PYJSON'
import json, sys
epost, navn, cms_url, send = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "1"
body = {
    "invitedUserEmailAddress": epost,
    "invitedUserDisplayName": navn,
    "inviteRedirectUrl": cms_url,
    "sendInvitationMessage": send,
}
if send:
    body["invitedUserMessageInfo"] = {
        "messageLanguage": "nb-NO",
        "customizedMessageBody": (
            "Du er invitert til CMS-et for ki.norge.no. Godta invitasjonen, og logg "
            f"deretter inn på {cms_url} med knappen Sign in with Microsoft."
        ),
    }
print(json.dumps(body, ensure_ascii=False))
PYJSON

    BRUKER_ID=$(az rest --method POST --url "https://graph.microsoft.com/v1.0/invitations" \
        --headers "Content-Type=application/json" \
        --body "@${INVITASJON}" \
        --query "invitedUser.id" -o tsv)

    BRUKER_NAVN="$EPOST"
    BRUKER_UPN=$(az ad user show --id "$BRUKER_ID" --query userPrincipalName -o tsv)
    echo "Guest account created: ${BRUKER_UPN}"
else
    BRUKER_ID=$(cut -f1 <<<"$TREFF")
    BRUKER_NAVN=$(cut -f2 <<<"$TREFF")
    BRUKER_UPN=$(cut -f3 <<<"$TREFF")

    if [[ "$BRUKER_UPN" == aas-* ]]; then
        echo "Warning: ${BRUKER_UPN} looks like an aas admin account, not a regular guest account." >&2
    fi
fi

# --- add to the group --------------------------------------------------------

ER_MEDLEM=$(az ad group member check --group "$GRUPPE_ID" --member-id "$BRUKER_ID" \
    --query value -o tsv 2>/dev/null || echo "false")

if [[ "$ER_MEDLEM" == "true" ]]; then
    echo "${BRUKER_NAVN} is already a member of \"${GRUPPE_NAVN}\". Nothing to do."
    exit 0
fi

echo
echo "  Person:  ${BRUKER_NAVN} <${EPOST}>"
echo "  Account: ${BRUKER_UPN}"
echo "  Group:   ${GRUPPE_NAVN}"
echo "  Grants:  Umbraco group \"${UMBRACO_GRUPPE}\" at ${CMS_URL}"
echo

if [[ "$BEKREFT" -eq 1 ]]; then
    read -r -p "Add? [y/N] " svar
    [[ "$svar" =~ ^[jJyY]$ ]] || { echo "Aborted."; exit 0; }
fi

az ad group member add --group "$GRUPPE_ID" --member-id "$BRUKER_ID"

echo "Added to ${GRUPPE_NAVN}."
echo
echo "Next steps:"
echo "  1. ${BRUKER_NAVN} goes to ${CMS_URL} and clicks Sign in with Microsoft."
echo "  2. If the user lands deactivated in Umbraco -> Users, enable it there."
