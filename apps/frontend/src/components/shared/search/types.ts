// Shared types for the KI-søk dialog (search-only).

/** A retrieved source/result from the ki.norge.no index. */
export interface KiResult {
  title: string;
  url: string;
  /** Content-type/category, e.g. "artikkel", "veiledning", "faq". */
  type: string;
  excerpt: string;
}
