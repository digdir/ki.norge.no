/**
 * Admin-tilgangen bak /status og forbi kommer-snart-veggen.
 *
 * Cookien bar verdien 1, og middlewaren sjekket bare at den fantes. Hvem som
 * helst som satte ki_admin=1 selv, kom inn. Nå bærer den en HMAC av
 * ADMIN_SECRET, som bare den som har hemmeligheten kan lage. Hemmeligheten selv
 * havner aldri i cookien, så en lekket cookie avslører ikke nøkkelen i
 * /admin-tilgang-lenken. Roteres hemmeligheten, slutter alle gamle cookier å gjelde.
 */

const encoder = new TextEncoder();

/** Sammenligner uten å avsløre gjennom tiden hvor langt de to strengene er like. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

// Ferdig streng, aldri et løfte. På Workers kan et løfte fra én forespørsel
// henge i en annen, en streng kan ikke det.
let cached: { secret: string; token: string } | null = null;

/** Cookie-verdien for en gitt hemmelighet. Uten hemmelighet finnes det ingen gyldig verdi. */
export async function adminToken(secret: string): Promise<string | null> {
  if (!secret) return null;
  if (cached?.secret === secret) return cached.token;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('ki_admin v1'));
  const token = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
  cached = { secret, token };
  return token;
}

export async function isAdminCookie(value: string | undefined, secret: string): Promise<boolean> {
  if (!value) return false;
  const token = await adminToken(secret);
  return token !== null && safeEqual(value, token);
}

export function keyMatches(key: string | null, secret: string): boolean {
  return Boolean(key && secret && safeEqual(key, secret));
}
