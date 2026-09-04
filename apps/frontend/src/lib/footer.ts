export interface FooterLenke {
  text: string;
  url: string;
}

/**
 * Slot 6 i footeren er ren opt-in. Lenke 1 til 5 har hardkodede standardverdier
 * i Footer.astro, denne har ingen: er feltene tomme, finnes ikke oppføringen.
 *
 * Begge feltene må være satt. Med bare tekst ville renderen falt til
 * knappe-varianten som lenke 5 bruker, og med bare URL hadde vi hatt en lenke
 * uten ledetekst. Trimmer, fordi et mellomrom fra en redaktør ikke er en lenke.
 */
export function footerLenke6(
  global: { footerLenke6Tekst?: string | null; footerLenke6Url?: string | null } | null | undefined,
): FooterLenke | null {
  const text = global?.footerLenke6Tekst?.trim();
  const url = global?.footerLenke6Url?.trim();
  return text && url ? { text, url } : null;
}
