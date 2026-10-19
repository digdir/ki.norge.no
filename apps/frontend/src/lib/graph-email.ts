/**
 * Sends email through Exchange Online via Microsoft Graph, with
 * client credentials. The app registration was set up by operations, and
 * Mail.Send is restricted to one mailbox with RBAC for Applications.
 *
 * No DNS setup is needed: we send through the mailbox, not on behalf
 * of the domain from outside, so the existing SPF and DKIM on kin.norge.no apply.
 */

// Same pattern as src/lib/search.ts. Tenant and client id are identifiers,
// not secrets, and live in vars. Only GRAPH_CLIENT_SECRET is a secret.
const TENANT_ID: string = process.env.GRAPH_TENANT_ID || import.meta.env.GRAPH_TENANT_ID || '';
const CLIENT_ID: string = process.env.GRAPH_CLIENT_ID || import.meta.env.GRAPH_CLIENT_ID || '';
const CLIENT_SECRET: string = process.env.GRAPH_CLIENT_SECRET || import.meta.env.GRAPH_CLIENT_SECRET || '';
const MAILBOX: string = process.env.KI_TILTAK_MAILBOX || import.meta.env.KI_TILTAK_MAILBOX || '';
/**
 * Who the submission goes to. Separate from MAILBOX on purpose.
 *
 * The sender is locked: the RBAC assignment from operations gives the app the right to send
 * as exactly that one mailbox, and nothing else. The recipient, on the other hand, is
 * free, and should be changeable without a code change. Then the editors can switch to a
 * distribution list, or add more, without a new deploy.
 *
 * Without the variable the mailbox sends to itself, which is the original
 * behaviour.
 */
const RECIPIENTS: string =
  process.env.KI_TILTAK_RECIPIENTS || import.meta.env.KI_TILTAK_RECIPIENTS || MAILBOX;

/**
 * True only when everything is in place. Logged as boolean presence, never as
 * length or content, since CodeQL tracks values derived from a secret to
 * the log (cs/cleartext-logging).
 */
export const emailIsConfigured = Boolean(TENANT_ID && CLIENT_ID && CLIENT_SECRET && MAILBOX);

export const mailboxAddress = MAILBOX;

/** Comma- or semicolon-separated list, so that several recipients are possible. */
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
 * Short-lived token per submission. The token lasts about an hour, but the form
 * is rarely used, so an extra round trip costs little compared to holding
 * shared, mutable state in a Worker isolate.
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
    // Only the error code, not the description. The code says what is wrong
    // (invalid_client usually means an expired or wrong secret) without including
    // text that originates from the request the secret was in.
    const code = isObject(data) && typeof data.error === 'string' ? data.error : 'unknown';
    console.error('[ki-tiltak] token request failed', { status: response.status, code });
    return null;
  }

  if (!isObject(data) || typeof data.access_token !== 'string') {
    console.error('[ki-tiltak] token response was missing access_token');
    return null;
  }
  return data.access_token;
}

export interface SendResult {
  ok: boolean;
  /** Short machine-readable reason. Never passed on to the browser as is. */
  reason?: 'not-configured' | 'token' | 'graph';
}

/**
 * Sends one email from the mailbox to itself, with the submitter's address as
 * Reply-To. The editor can then reply directly to whoever submitted the tiltak.
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
          // Plain text on purpose. Then there is no path from submitted text to
          // markup in the email client, and nothing has to be escaped.
          body: { contentType: 'Text', content: text },
          toRecipients: recipientList(),
          replyTo: [{ emailAddress: { address: svarTil } }],
        },
        saveToSentItems: true,
      }),
    },
  );

  // Graph answers 202 Accepted when the message has been queued.
  if (response.status !== 202) {
    console.error('[ki-tiltak] sendMail failed', { status: response.status });
    return { ok: false, reason: 'graph' };
  }
  return { ok: true };
}
