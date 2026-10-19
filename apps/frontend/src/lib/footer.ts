export interface FooterLenke {
  text: string;
  url: string;
}

/**
 * Slot 6 in the footer is pure opt-in. Links 1 to 5 have hardcoded default values
 * in Footer.astro, this one has none: if the fields are empty, the entry does not exist.
 *
 * Both fields must be set. With only text the render would fall back to the
 * button variant that link 5 uses, and with only a URL we would have a link
 * without a label. Trims, because a space from an editor is not a link.
 */
export function footerLenke6(
  global: { footerLenke6Tekst?: string | null; footerLenke6Url?: string | null } | null | undefined,
): FooterLenke | null {
  const text = global?.footerLenke6Tekst?.trim();
  const url = global?.footerLenke6Url?.trim();
  return text && url ? { text, url } : null;
}
