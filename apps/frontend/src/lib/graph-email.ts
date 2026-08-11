/**
 * Sender e-post gjennom Exchange Online via Microsoft Graph, med
 * client credentials. Appregistreringen er satt opp av drift, og
 * Mail.Send er avgrenset til én postboks med RBAC for Applications.
 *
 * Ingen DNS-oppsett er nødvendig: vi sender gjennom postboksen, ikke på vegne
 * av domenet utenfra, så eksisterende SPF og DKIM på kin.norge.no gjelder.
 */

// Samme mønster som src/lib/search.ts. Tenant og klient-id er identifikatorer,
// ikke hemmeligheter, og ligger i vars. Bare GRAPH_CLIENT_SECRET er en secret.
const TENANT_ID = process.env.GRAPH_TENANT_ID || import.meta.env.GRAPH_TENANT_ID || '';
const CLIENT_ID = process.env.GRAPH_CLIENT_ID || import.meta.env.GRAPH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET || import.meta.env.GRAPH_CLIENT_SECRET || '';
const MAILBOX = process.env.KI_TILTAK_MAILBOX || import.meta.env.KI_TILTAK_MAILBOX || '';
/**
 * Hvem innsendingen havner hos. Skilt fra MAILBOX med vilje.
 *
 * Avsenderen er låst: RBAC-tildelingen fra drift gir appen rett til å sende
 * som nøyaktig den ene postboksen, og ingenting annet. Mottakeren er derimot
 * fri, og bør kunne endres uten kodeendring. Da kan redaksjonen bytte til en
 * distribusjonsliste, eller legge til flere, uten en ny deploy.
 *
 * Uten variabelen sender postboksen til seg selv, som er den opprinnelige
 * oppførselen.
 */
const RECIPIENTS =
  process.env.KI_TILTAK_RECIPIENTS || import.meta.env.KI_TILTAK_RECIPIENTS || MAILBOX;

/**
 * Sann bare når alt er på plass. Logges som boolsk tilstedeværelse, aldri som
 * lengde eller innhold, siden CodeQL sporer verdier avledet av en secret til
 * loggen (cs/cleartext-logging).
 */
export const emailIsConfigured = Boolean(TENANT_ID && CLIENT_ID && CLIENT_SECRET && MAILBOX);

export const mailboxAddress = MAILBOX;

/** Komma- eller semikolonseparert liste, slik at flere mottakere er mulig. */
function recipientList(): { emailAddress: { address: string } }[] {
  return RECIPIENTS.split(/[,;]/)
    .map((address) => address.trim())
    .filter((address) => address.length > 0)
    .map((address) => ({ emailAddress: { address } }));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Kortlevd token per innsending. Tokenet varer omtrent en time, men skjemaet
 * brukes sjelden, så en ekstra rundtur koster lite sammenlignet med å holde
 * delt, foranderlig tilstand i en Worker-isolat.
 */
async function getToken(): Promise<string | null> {
  const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // Bare feilkoden, ikke beskrivelsen. Koden sier hva som er galt
    // (invalid_client betyr som regel utløpt eller feil secret) uten å ta med
    // tekst som stammer fra forespørselen der hemmeligheten lå.
    const code = isObject(data) && typeof data.error === 'string' ? data.error : 'ukjent';
    console.error('[ki-tiltak] token-forespørsel feilet', { status: response.status, code });
    return null;
  }

  if (!isObject(data) || typeof data.access_token !== 'string') {
    console.error('[ki-tiltak] token-svaret manglet access_token');
    return null;
  }
  return data.access_token;
}

export interface SendResult {
  ok: boolean;
  /** Kort maskinlesbar årsak. Sendes aldri videre til nettleseren som den er. */
  reason?: 'not-configured' | 'token' | 'graph';
}

/**
 * Sender én e-post fra postboksen til seg selv, med innsenderens adresse som
 * Reply-To. Redaktøren kan da svare direkte til den som meldte inn tiltaket.
 */
export async function sendTiltakEmail(
  subject: string,
  text: string,
  svarTil: string,
): Promise<SendResult> {
  if (!emailIsConfigured) return { ok: false, reason: 'not-configured' };

  const token = await getToken();
  if (token === null) return { ok: false, reason: 'token' };

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: subject,
          // Ren tekst med vilje. Da finnes det ingen vei fra innsendt tekst til
          // markup i e-postklienten, og ingenting må escapes.
          body: { contentType: 'Text', content: text },
          toRecipients: recipientList(),
          replyTo: [{ emailAddress: { address: svarTil } }],
        },
        saveToSentItems: true,
      }),
    },
  );

  // Graph svarer 202 Accepted når meldingen er lagt i kø.
  if (response.status !== 202) {
    console.error('[ki-tiltak] sendMail feilet', { status: response.status });
    return { ok: false, reason: 'graph' };
  }
  return { ok: true };
}
